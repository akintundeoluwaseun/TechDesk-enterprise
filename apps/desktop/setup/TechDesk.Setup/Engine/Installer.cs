using System.Diagnostics;
using Microsoft.Win32;

namespace TechDesk.Setup.Engine;

internal readonly record struct InstallProgress(string Stage, double Fraction);

/// <summary>
/// Putting TechDesk on the PC.
///
/// The ordering here is the whole design. An update replaces the app a shop
/// opens every morning, usually while nobody is watching, so the one outcome
/// that must be impossible is a half-replaced install: a folder containing
/// some of 4.17 and some of 4.18 starts and then breaks in ways nobody can
/// diagnose.
///
/// So nothing is replaced until everything has been unpacked. The new copy is
/// built beside the old one, the old one is moved out of the way, the new one
/// takes its place, and only then is the old one deleted. If anything throws
/// before the swap, the old install has not been touched. If the swap itself
/// fails halfway, the old copy is put back. The shop either gets the new
/// version or keeps the one it had -- never neither.
///
/// The staging folder is deliberately a sibling of the install folder rather
/// than somewhere in %TEMP%: a move within one volume is a rename, which is
/// near-instant and cannot fail part-way, while a move across volumes is a
/// copy, which can.
/// </summary>
internal sealed class Installer(CommandLine options)
{
    public string InstallDir { get; } = options.InstallDir ?? ExistingDir() ?? Target.DefaultInstallDir;

    /// <summary>
    /// Where TechDesk is already installed for this user, if it is. An update
    /// must land on top of the existing copy, wherever the owner put it,
    /// rather than in the default place beside it.
    /// </summary>
    private static string? ExistingDir()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(Target.InstallKey);
            var dir = key?.GetValue("InstallLocation") as string;
            return string.IsNullOrWhiteSpace(dir) ? null : dir;
        }
        catch (Exception e) when (e is System.Security.SecurityException or UnauthorizedAccessException or IOException)
        {
            Log.Failure("reading the existing install location", e);
            return null;
        }
    }

    public void Run(IProgress<InstallProgress>? progress, CancellationToken cancel)
    {
        Log.Write($"install starting: {options.Describe()} into {InstallDir}");
        progress?.Report(new InstallProgress("Getting ready", 0.01));

        var parent = Path.GetDirectoryName(Path.GetFullPath(InstallDir))
            ?? throw new InvalidOperationException($"'{InstallDir}' has no parent folder.");
        Directory.CreateDirectory(parent);

        var tag = Environment.ProcessId.ToString();
        var staging = Path.Combine(parent, $"{Path.GetFileName(InstallDir)}.new-{tag}");
        var retired = Path.Combine(parent, $"{Path.GetFileName(InstallDir)}.old-{tag}");

        CleanUp(staging);
        CleanUp(retired);

        if (!AppProcess.StopRunning(InstallDir))
        {
            throw new IOException(
                "TechDesk is still running and its files cannot be replaced. "
                + "Please close TechDesk and run this again.");
        }

        try
        {
            progress?.Report(new InstallProgress("Copying TechDesk onto this PC", 0.05));
            Payload.Extract(
                staging,
                new Progress<PayloadProgress>(p =>
                {
                    // Unpacking is the long part, so it owns most of the bar:
                    // 5% to 85%.
                    var share = p.BytesTotal <= 0 ? 0 : (double)p.BytesRead / p.BytesTotal;
                    progress?.Report(new InstallProgress(
                        "Copying TechDesk onto this PC", 0.05 + (share * 0.80)));
                }),
                cancel);

            var exe = Path.Combine(staging, Target.ExeName);
            if (!File.Exists(exe))
            {
                throw new FileNotFoundException(
                    $"The copy that was unpacked has no {Target.ExeName} in it.", exe);
            }

            progress?.Report(new InstallProgress("Putting it in place", 0.87));
            Swap(staging, retired);
        }
        catch
        {
            CleanUp(staging);
            throw;
        }

        // From here the new copy is live. Anything that fails below is worth
        // recording but is not worth tearing a working install back down for:
        // a missing desktop shortcut is a nuisance, an abandoned rollback is a
        // broken till.
        try
        {
            progress?.Report(new InstallProgress("Finishing off", 0.90));
            var exe = Path.Combine(InstallDir, Target.ExeName);

            var uninstaller = Path.Combine(InstallDir, Target.UninstallerName);
            Payload.CopyProgramTo(uninstaller);

            Shortcuts.Create(Target.DesktopShortcut, exe);
            Shortcuts.Create(Target.StartMenuShortcut, exe);
            Register(exe, uninstaller);
            Shortcuts.NotifyShell();
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or System.Security.SecurityException)
        {
            Log.Failure("finishing the install", e);
        }

        CleanUp(retired);
        progress?.Report(new InstallProgress("Done", 1.0));
        Log.Write("install finished");
    }

    /// <summary>
    /// Replaces the old copy with the new one, and puts the old one back if
    /// that cannot be completed.
    /// </summary>
    private void Swap(string staging, string retired)
    {
        var had = Directory.Exists(InstallDir);
        if (had)
        {
            Directory.Move(InstallDir, retired);
        }

        try
        {
            Directory.Move(staging, InstallDir);
        }
        catch
        {
            if (had && !Directory.Exists(InstallDir))
            {
                Log.Write("could not put the new copy in place; restoring the previous one");
                try
                {
                    Directory.Move(retired, InstallDir);
                }
                catch (Exception e) when (e is IOException or UnauthorizedAccessException)
                {
                    Log.Failure("restoring the previous install", e);
                }
            }

            throw;
        }
    }

    /// <summary>
    /// The Add/Remove Programs row and the record of where we installed.
    ///
    /// Written under the same keys and the same GUID the NSIS installer used,
    /// so Windows treats this as the same product it already knows about. A
    /// different key here means a second row in Add/Remove Programs beside the
    /// old one, which is the fault 4.16.2 fixed.
    /// </summary>
    private void Register(string exe, string uninstaller)
    {
        var version = BuildInfo.Version;

        using (var key = Registry.CurrentUser.CreateSubKey(Target.UninstallKey))
        {
            key.SetValue("DisplayName", $"{Target.ProductName} {version}");
            key.SetValue("DisplayVersion", version);
            key.SetValue("DisplayIcon", $"{exe},0");
            key.SetValue("Publisher", Target.Publisher);
            key.SetValue("URLInfoAbout", Target.HomePage);
            key.SetValue("InstallLocation", InstallDir);
            key.SetValue("UninstallString", $"\"{uninstaller}\"");
            key.SetValue("QuietUninstallString", $"\"{uninstaller}\" /S");
            key.SetValue("NoModify", 1, RegistryValueKind.DWord);
            key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
            key.SetValue("EstimatedSize", EstimatedKilobytes(), RegistryValueKind.DWord);
            key.SetValue("InstallDate", DateTime.Now.ToString("yyyyMMdd"));
        }

        using (var key = Registry.CurrentUser.CreateSubKey(Target.InstallKey))
        {
            key.SetValue("InstallLocation", InstallDir);
            key.SetValue("ShortcutName", Target.ShortcutName);
            key.SetValue("KeepShortcuts", "true");
        }

        Log.Write($"registered {Target.ProductName} {version} at {InstallDir}");
    }

    private int EstimatedKilobytes()
    {
        try
        {
            long bytes = 0;
            foreach (var f in Directory.EnumerateFiles(InstallDir, "*", SearchOption.AllDirectories))
            {
                bytes += new FileInfo(f).Length;
            }

            return (int)Math.Min(bytes / 1024, int.MaxValue);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            Log.Failure("measuring the install", e);
            return 0;
        }
    }

    /// <summary>
    /// A per-machine copy left behind by an installer older than 4.16.2. It
    /// lives in Program Files under HKLM, so removing it needs administrator
    /// rights this installer deliberately does not ask for. It cannot be
    /// deleted from here -- but it can be reported, which is better than
    /// leaving someone to wonder why there are two TechDesks in the list.
    /// </summary>
    public static string? StalePerMachineCopy()
    {
        try
        {
            using var key = Registry.LocalMachine.OpenSubKey(Target.UninstallKey);
            var dir = key?.GetValue("InstallLocation") as string;
            return string.IsNullOrWhiteSpace(dir) ? null : dir;
        }
        catch (Exception e) when (e is System.Security.SecurityException or UnauthorizedAccessException or IOException)
        {
            return null;
        }
    }

    public void Launch()
    {
        var exe = Path.Combine(InstallDir, Target.ExeName);
        try
        {
            using var p = Process.Start(new ProcessStartInfo(exe)
            {
                UseShellExecute = true,
                WorkingDirectory = InstallDir,
            });
            Log.Write("started TechDesk");
        }
        catch (Exception e) when (e is System.ComponentModel.Win32Exception or InvalidOperationException or IOException)
        {
            Log.Failure("starting TechDesk", e);
        }
    }

    private static void CleanUp(string dir)
    {
        try
        {
            if (Directory.Exists(dir))
            {
                Directory.Delete(dir, recursive: true);
            }
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            // Leftovers are untidy, not dangerous: they are named with the
            // process id and the next run clears them.
            Log.Failure($"clearing {dir}", e);
        }
    }
}
