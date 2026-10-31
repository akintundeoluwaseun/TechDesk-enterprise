using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;

namespace TechDesk.Setup.Engine;

/// <summary>
/// Desktop and Start Menu shortcuts, written as real .lnk files through the
/// shell's own IShellLink -- the same thing Explorer uses when you drag a
/// shortcut out of a folder.
///
/// Done this way rather than by shelling out to PowerShell or WScript for two
/// reasons: both of those can be blocked by policy on a shop's PC or flagged
/// by antivirus when an unknown .exe invokes them, and neither can be relied
/// on to exist. A direct COM call has nothing in between to go wrong.
///
/// Both shortcuts go in this user's own folders. Writing to the All Users
/// desktop would need administrator rights and would put TechDesk on every
/// account on the PC -- which is the per-machine behaviour that caused the
/// duplicate-install fault in the first place.
/// </summary>
internal static class Shortcuts
{
    public static void Create(string lnkPath, string targetExe, string? description = null)
    {
        var link = NewShellLink();
        link.SetPath(targetExe);
        link.SetWorkingDirectory(Path.GetDirectoryName(targetExe) ?? string.Empty);
        // Icon from the app's own executable, so the shortcut keeps the right
        // picture after an update replaces the file.
        link.SetIconLocation(targetExe, 0);
        link.SetDescription(description ?? Target.ProductName);

        Directory.CreateDirectory(Path.GetDirectoryName(lnkPath)!);
        ((IPersistFile)link).Save(lnkPath, fRemember: true);
        Log.Write($"shortcut written: {lnkPath}");
    }

    public static void Remove(string lnkPath)
    {
        try
        {
            if (File.Exists(lnkPath))
            {
                File.Delete(lnkPath);
                Log.Write($"shortcut removed: {lnkPath}");
            }
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            Log.Failure($"removing shortcut {lnkPath}", e);
        }
    }

    /// <summary>
    /// Tells Explorer something changed, so a new desktop icon appears at once
    /// instead of after the next refresh or sign-in. Cosmetic, but without it
    /// the install looks like it did nothing.
    /// </summary>
    public static void NotifyShell()
    {
        const uint ShcneAssocChanged = 0x08000000;
        const uint ShcnfIdList = 0x0000;
        try
        {
            SHChangeNotify(ShcneAssocChanged, ShcnfIdList, IntPtr.Zero, IntPtr.Zero);
        }
        catch (Exception e) when (e is DllNotFoundException or EntryPointNotFoundException)
        {
            // Not worth failing an install over a desktop refresh.
            Log.Failure("refreshing the desktop", e);
        }
    }

    /// <summary>
    /// The shell's ShellLink object. Created from its class id rather than
    /// through a [ComImport] coclass declaration, because the compiler will
    /// not let you cast such a class to an interface it does not visibly
    /// implement (CS0030), and the usual way round that is a cast through
    /// object, which works only because nobody is checking. Going via the
    /// class id says what is actually happening.
    /// </summary>
    private static IShellLinkW NewShellLink()
    {
        var clsid = new Guid("00021401-0000-0000-C000-000000000046");
        var type = Type.GetTypeFromCLSID(clsid)
            ?? throw new PlatformNotSupportedException("This PC has no shell link support.");
        return (IShellLinkW)(Activator.CreateInstance(type)
            ?? throw new InvalidOperationException("The shell would not create a shortcut object."));
    }

    [DllImport("shell32.dll", SetLastError = true)]
    private static extern void SHChangeNotify(uint eventId, uint flags, IntPtr item1, IntPtr item2);

    [ComImport]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    [Guid("000214F9-0000-0000-C000-000000000046")]
    private interface IShellLinkW
    {
        void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder file, int maxPath, IntPtr findData, uint flags);

        void GetIDList(out IntPtr idList);

        void SetIDList(IntPtr idList);

        void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder name, int maxName);

        void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string name);

        void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder dir, int maxPath);

        void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string dir);

        void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder args, int maxArgs);

        void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string args);

        void GetHotkey(out short hotkey);

        void SetHotkey(short hotkey);

        void GetShowCmd(out int showCmd);

        void SetShowCmd(int showCmd);

        void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder iconPath, int iconPathMax, out int iconIndex);

        void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string iconPath, int iconIndex);

        void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string pathRel, uint reserved);

        void Resolve(IntPtr hwnd, uint flags);

        void SetPath([MarshalAs(UnmanagedType.LPWStr)] string file);
    }
}
