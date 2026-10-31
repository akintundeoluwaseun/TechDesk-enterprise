using Microsoft.Win32;

namespace TechDesk.Setup.Engine;

/// <summary>
/// Taking TechDesk off the PC.
///
/// The important thing this does is ask before deleting the shop's records.
/// %APPDATA%\TechDesk holds every sale, repair, customer and stock item the
/// shop has ever entered. Someone uninstalling to reinstall a fresh copy, or
/// to move to another PC, expects that to survive -- and an uninstaller that
/// silently takes it with it destroys the business's books. The NSIS
/// uninstaller asked, so this one asks too.
///
/// Under /S there is nobody to ask, so the data is kept. Keeping data nobody
/// wanted is a tidiness problem; deleting data somebody needed is not
/// recoverable.
/// </summary>
internal sealed class Uninstaller
{
    public string InstallDir { get; }

    public Uninstaller()
    {
        // The uninstaller lives inside the folder it removes, which is the
        // most reliable thing to go on; the registry is the fallback.
        var beside = Path.GetDirectoryName(Environment.ProcessPath ?? string.Empty);
        InstallDir = !string.IsNullOrWhiteSpace(beside) && File.Exists(Path.Combine(beside, Target.ExeName))
            ? beside
            : FromRegistry() ?? Target.DefaultInstallDir;
    }

    private static string? FromRegistry()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(Target.InstallKey);
            return key?.GetValue("InstallLocation") as string;
        }
        catch (Exception e) when (e is System.Security.SecurityException or UnauthorizedAccessException or IOException)
        {
            return null;
        }
    }

    public static bool HasData => Directory.Exists(Target.DataDir);

    public void Run(bool alsoRemoveData)
    {
        Log.Write($"uninstall starting from {InstallDir}; removing data: {alsoRemoveData}");

        AppProcess.StopRunning(InstallDir);

        Shortcuts.Remove(Target.DesktopShortcut);
        Shortcuts.Remove(Target.StartMenuShortcut);

        Unregister();
        RemoveInstallFolder();

        if (alsoRemoveData)
        {
            Delete(Target.DataDir, "the shop's data");
        }
        else
        {
            Log.Write($"kept the shop's data at {Target.DataDir}");
        }

        Shortcuts.NotifyShell();
        Log.Write("uninstall finished");
    }

    private static void Unregister()
    {
        foreach (var key in new[] { Target.UninstallKey, Target.InstallKey })
        {
            try
            {
                Registry.CurrentUser.DeleteSubKeyTree(key, throwOnMissingSubKey: false);
            }
            catch (Exception e) when (e is System.Security.SecurityException or UnauthorizedAccessException or IOException)
            {
                Log.Failure($"removing registry key {key}", e);
            }
        }
    }

    /// <summary>
    /// Removes the install folder, leaving behind only the running
    /// uninstaller itself -- a program cannot delete its own .exe while it is
    /// executing. That one file is handed to Windows to delete on the next
    /// restart, so nothing is left permanently.
    /// </summary>
    private void RemoveInstallFolder()
    {
        var self = Path.GetFullPath(Environment.ProcessPath ?? string.Empty);

        if (!Directory.Exists(InstallDir))
        {
            return;
        }

        foreach (var file in Directory.EnumerateFiles(InstallDir, "*", SearchOption.AllDirectories))
        {
            if (string.Equals(Path.GetFullPath(file), self, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            try
            {
                File.SetAttributes(file, FileAttributes.Normal);
                File.Delete(file);
            }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException)
            {
                Log.Failure($"deleting {file}", e);
            }
        }

        // Directories, deepest first, so each is empty when its turn comes.
        foreach (var dir in Directory.EnumerateDirectories(InstallDir, "*", SearchOption.AllDirectories)
                     .OrderByDescending(d => d.Length))
        {
            TryRemoveEmpty(dir);
        }

        if (self.StartsWith(InstallDir, StringComparison.OrdinalIgnoreCase))
        {
            PendingDelete.OnRestart(self);
            PendingDelete.OnRestart(InstallDir);
        }
        else
        {
            TryRemoveEmpty(InstallDir);
        }
    }

    private static void TryRemoveEmpty(string dir)
    {
        try
        {
            if (Directory.Exists(dir) && !Directory.EnumerateFileSystemEntries(dir).Any())
            {
                Directory.Delete(dir);
            }
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            Log.Failure($"removing folder {dir}", e);
        }
    }

    private static void Delete(string dir, string what)
    {
        try
        {
            if (Directory.Exists(dir))
            {
                Directory.Delete(dir, recursive: true);
                Log.Write($"removed {what}");
            }
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            Log.Failure($"removing {what}", e);
        }
    }
}
