using System.Buffers.Binary;
using System.Formats.Tar;
using System.IO.Compression;

namespace TechDesk.Setup.Engine;

internal readonly record struct PayloadProgress(long BytesRead, long BytesTotal, string? CurrentFile);

/// <summary>
/// The app itself, carried inside this installer.
///
/// TechDesk unpacked is about 265 MB -- Electron, Chromium and the app. It is
/// appended to the end of this .exe as a tar compressed with Brotli, rather
/// than embedded as a .NET resource, for a practical reason: a resource lives
/// inside the main assembly, and the single-file bundler compresses the whole
/// assembly on publish. That would mean Brotli-compressing an already
/// Brotli-compressed 88 MB blob for no gain and several minutes of build time.
/// Appended data is untouched by the bundler.
///
/// tar and Brotli specifically because both decompress with nothing but the
/// .NET base class library (System.Formats.Tar, System.IO.Compression). A .7z
/// or LZMA payload would compress better -- it is what NSIS used -- but would
/// need a third-party decoder shipped alongside, and a native DLL inside an
/// installer is exactly the shape antivirus treats as suspicious.
///
/// Finding it again is the fiddly part, and the reason for the PE parsing
/// below. The obvious approach -- read the last bytes of the file -- works
/// until the installer is code-signed, because signtool appends the
/// certificate table to the very end, after the payload. So the footer is
/// looked for in both places: at the end of the file, and immediately before
/// the certificate table when there is one. That way signing the installer
/// later does not quietly break it.
/// </summary>
internal static class Payload
{
    /// <summary>Marks the end of the payload. Chosen to be unmistakable.</summary>
    private static readonly byte[] Magic = "TECHDESK-PAYLOAD"u8.ToArray();

    private const int FooterSize = 16 + 8 + 8; // magic, compressed length, unpacked length

    public readonly record struct Location(long Offset, long CompressedLength, long UnpackedLength);

    /// <summary>
    /// True when this executable carries an app payload. False for a plain
    /// build, which is how the project is compiled during development.
    /// </summary>
    public static bool Exists() => Find() is not null;

    public static Location? Find()
    {
        var self = Environment.ProcessPath;
        if (string.IsNullOrEmpty(self) || !File.Exists(self))
        {
            return null;
        }

        try
        {
            using var fs = File.OpenRead(self);

            // The common case: nothing appended after the payload.
            var at = TryFooterAt(fs, fs.Length);
            if (at is not null)
            {
                return at;
            }

            // Signed: the certificate table sits after the payload, so the
            // payload ends where that table begins.
            var certStart = SecurityDirectoryOffset(fs);
            if (certStart > 0 && certStart <= fs.Length)
            {
                return TryFooterAt(fs, certStart);
            }

            return null;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or NotSupportedException)
        {
            Log.Failure("reading the installer's own payload", e);
            return null;
        }
    }

    /// <summary>Reads a footer ending at <paramref name="end"/>, if one is there.</summary>
    private static Location? TryFooterAt(FileStream fs, long end)
    {
        if (end < FooterSize)
        {
            return null;
        }

        var footer = new byte[FooterSize];
        fs.Position = end - FooterSize;
        fs.ReadExactly(footer);

        if (!footer.AsSpan(0, Magic.Length).SequenceEqual(Magic))
        {
            return null;
        }

        var compressed = BinaryPrimitives.ReadInt64LittleEndian(footer.AsSpan(16, 8));
        var unpacked = BinaryPrimitives.ReadInt64LittleEndian(footer.AsSpan(24, 8));
        var offset = end - FooterSize - compressed;

        if (compressed <= 0 || offset < 0)
        {
            Log.Write($"payload footer found but makes no sense: compressed={compressed} offset={offset}");
            return null;
        }

        return new Location(offset, compressed, unpacked);
    }

    /// <summary>
    /// File offset of the Authenticode certificate table, or 0 when the file
    /// is not signed. This is data directory entry 4, whose address is a plain
    /// file offset rather than a virtual address -- the one exception among
    /// the directories, and the thing that makes this possible at all.
    /// </summary>
    private static long SecurityDirectoryOffset(FileStream fs)
    {
        try
        {
            var buf = new byte[4];

            fs.Position = 0x3C;
            fs.ReadExactly(buf);
            long peHeader = BinaryPrimitives.ReadUInt32LittleEndian(buf);
            if (peHeader <= 0 || peHeader + 24 > fs.Length)
            {
                return 0;
            }

            fs.Position = peHeader;
            fs.ReadExactly(buf);
            if (buf[0] != (byte)'P' || buf[1] != (byte)'E' || buf[2] != 0 || buf[3] != 0)
            {
                return 0;
            }

            // Optional header begins after the 4-byte signature and the
            // 20-byte COFF file header.
            var optional = peHeader + 4 + 20;
            fs.Position = optional;
            var magic = new byte[2];
            fs.ReadExactly(magic);
            var pe32Plus = BinaryPrimitives.ReadUInt16LittleEndian(magic) == 0x20B;

            // Data directories start 96 bytes into a PE32 optional header,
            // 112 into a PE32+ one; the security entry is the fifth.
            var directories = optional + (pe32Plus ? 112 : 96);
            var security = directories + (4 * 8);
            if (security + 8 > fs.Length)
            {
                return 0;
            }

            fs.Position = security;
            fs.ReadExactly(buf);
            long offset = BinaryPrimitives.ReadUInt32LittleEndian(buf);
            fs.ReadExactly(buf);
            long size = BinaryPrimitives.ReadUInt32LittleEndian(buf);

            return size > 0 ? offset : 0;
        }
        catch (Exception e) when (e is IOException or EndOfStreamException or NotSupportedException)
        {
            Log.Failure("reading the PE header", e);
            return 0;
        }
    }

    /// <summary>
    /// Copies just the installer program to <paramref name="destination"/>,
    /// leaving the app payload behind.
    ///
    /// This is how the uninstaller is made. Copying the whole of this .exe
    /// would work, but it would put the entire compressed app -- another
    /// hundred megabytes -- into the install folder permanently, to sit there
    /// unread for the life of the install. The uninstaller needs the program
    /// and the .NET runtime it rides on; it has no use for the copy of
    /// TechDesk it once installed.
    ///
    /// Truncating at the payload also drops any Authenticode signature,
    /// since that sits after the payload. That costs nothing here: the
    /// uninstaller is run from the install folder rather than downloaded, so
    /// it never carries a mark-of-the-web and SmartScreen never looks at it.
    /// </summary>
    public static void CopyProgramTo(string destination)
    {
        var self = Environment.ProcessPath
            ?? throw new InvalidOperationException("Cannot find this installer's own path.");

        var where = Find();
        if (where is null)
        {
            // Built without a payload: there is nothing to leave out.
            File.Copy(self, destination, overwrite: true);
            return;
        }

        using var from = File.OpenRead(self);
        using var to = File.Create(destination);

        var buffer = new byte[1 << 20];
        var left = where.Value.Offset;
        while (left > 0)
        {
            var read = from.Read(buffer, 0, (int)Math.Min(buffer.Length, left));
            if (read <= 0)
            {
                break;
            }

            to.Write(buffer, 0, read);
            left -= read;
        }

        Log.Write($"uninstaller written: {destination} ({where.Value.Offset} bytes, payload left out)");
    }

    /// <summary>
    /// Unpacks the app into <paramref name="destination"/>, which is created
    /// if needed and must be somewhere it is safe to write.
    /// </summary>
    public static void Extract(
        string destination,
        IProgress<PayloadProgress>? progress,
        CancellationToken cancel)
    {
        var where = Find() ?? throw new InvalidOperationException(
            "This installer has no app inside it. It was built without a payload.");

        Directory.CreateDirectory(destination);
        var root = Path.GetFullPath(destination);

        using var fs = File.OpenRead(Environment.ProcessPath!);
        using var slice = new WindowStream(fs, where.Offset, where.CompressedLength);

        // Progress is reported against the compressed bytes consumed, which is
        // steady and known in advance. Counting unpacked bytes instead makes
        // the bar lurch, because the payload is mostly a few very large files.
        var counted = new CountingStream(slice);
        using var brotli = new BrotliStream(counted, CompressionMode.Decompress);
        using var tar = new TarReader(brotli);

        var files = 0;
        while (tar.GetNextEntry(copyData: false) is { } entry)
        {
            cancel.ThrowIfCancellationRequested();

            var relative = Normalise(entry.Name);
            if (relative is null)
            {
                continue;
            }

            var target = Path.GetFullPath(Path.Combine(root, relative));

            // A tar can name "../../Windows/System32/..." and a careless
            // extractor will write there. The payload is ours, but an
            // extractor that trusts its input is a bug regardless of who
            // supplied it today.
            if (!target.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)
                && !string.Equals(target, root, StringComparison.OrdinalIgnoreCase))
            {
                Log.Write($"payload entry refused, outside the install folder: {entry.Name}");
                continue;
            }

            if (entry.EntryType is TarEntryType.Directory)
            {
                Directory.CreateDirectory(target);
                continue;
            }

            if (entry.EntryType is not (TarEntryType.RegularFile or TarEntryType.V7RegularFile))
            {
                continue;
            }

            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            entry.ExtractToFile(target, overwrite: true);
            files++;

            progress?.Report(new PayloadProgress(
                counted.BytesRead, where.CompressedLength, relative));
        }

        Log.Write($"unpacked {files} files into {destination}");
        progress?.Report(new PayloadProgress(where.CompressedLength, where.CompressedLength, null));
    }

    /// <summary>
    /// tar names are relative and often prefixed "./". Returns null for
    /// entries that name nothing useful.
    /// </summary>
    private static string? Normalise(string name)
    {
        var n = name.Replace('/', Path.DirectorySeparatorChar).TrimStart(Path.DirectorySeparatorChar);
        if (n.StartsWith("." + Path.DirectorySeparatorChar, StringComparison.Ordinal))
        {
            n = n[2..];
        }

        n = n.Trim();
        return n.Length == 0 || n == "." ? null : n;
    }

    /// <summary>A fixed window onto part of a larger file.</summary>
    private sealed class WindowStream(Stream inner, long offset, long length) : Stream
    {
        private long position;

        public override bool CanRead => true;

        public override bool CanSeek => false;

        public override bool CanWrite => false;

        public override long Length => length;

        public override long Position
        {
            get => position;
            set => throw new NotSupportedException();
        }

        public override int Read(byte[] buffer, int start, int count)
        {
            var left = length - position;
            if (left <= 0)
            {
                return 0;
            }

            inner.Position = offset + position;
            var read = inner.Read(buffer, start, (int)Math.Min(count, left));
            position += read;
            return read;
        }

        public override void Flush()
        {
        }

        public override long Seek(long o, SeekOrigin origin) => throw new NotSupportedException();

        public override void SetLength(long value) => throw new NotSupportedException();

        public override void Write(byte[] buffer, int start, int count) => throw new NotSupportedException();
    }

    /// <summary>Counts what has been read, for the progress bar.</summary>
    private sealed class CountingStream(Stream inner) : Stream
    {
        public long BytesRead { get; private set; }

        public override bool CanRead => true;

        public override bool CanSeek => false;

        public override bool CanWrite => false;

        public override long Length => inner.Length;

        public override long Position
        {
            get => BytesRead;
            set => throw new NotSupportedException();
        }

        public override int Read(byte[] buffer, int start, int count)
        {
            var read = inner.Read(buffer, start, count);
            BytesRead += read;
            return read;
        }

        public override void Flush()
        {
        }

        public override long Seek(long o, SeekOrigin origin) => throw new NotSupportedException();

        public override void SetLength(long value) => throw new NotSupportedException();

        public override void Write(byte[] buffer, int start, int count) => throw new NotSupportedException();
    }
}
