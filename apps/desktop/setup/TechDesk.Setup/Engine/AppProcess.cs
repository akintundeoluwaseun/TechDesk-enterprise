using System.Diagnostics;

namespace TechDesk.Setup.Engine;

/// <summary>
/// Getting TechDesk to stop before its files are replaced.
///
/// Windows will not let a running .exe be overwritten, so an update that does
/// not deal with this fails halfway -- which is the state most likely to leave
/// a shop with a broken install. electron-updater quits the app before running
/// the installer, but that is not enough on its own: a second window, a tray
/// process, or a copy the owner started by hand can still be holding the file.
///
/// Asked politely first (close the window, as a person would), then waited for,
/// and only killed if it will not go. A till that is mid-sale deserves the
/// chance to shut down properly.
/// </summary>
internal static class AppProcess
{
    private static readonly TimeSpan Polite = TimeSpan.FromSeconds(10);
    private static readonly TimeSpan Grace = TimeSpan.FromSeconds(5);

    /// <summary>
    /// Stops every copy of TechDesk running out of <paramref name="installDir"/>.
    /// Returns false only if something is still holding on at the end.
    /// </summary>
    public static bool StopRunning(string installDir)
    {
        var running = Find(installDir);
        if (running.Count == 0)
        {
            return true;
        }

        Log.Write($"{running.Count} TechDesk process(es) running; asking them to close");

        foreach (var p in running)
        {
            try
            {
                // Closes the window the way the X button does, so the app runs
                // its own shutdown and flushes whatever it was holding.
                p.CloseMainWindow();
            }
            catch (Exception e) when (e is InvalidOperationException or PlatformNotSupportedException)
            {
                // Already gone, or has no window to close. Either is fine.
            }
        }

        var deadline = DateTime.UtcNow + Polite;
        foreach (var p in running)
        {
            try
            {
                var left = deadline - DateTime.UtcNow;
                if (left > TimeSpan.Zero)
                {
                    p.WaitForExit((int)left.TotalMilliseconds);
                }
            }
            catch (Exception e) when (e is InvalidOperationException or SystemException)
            {
                // Exited while we were waiting.
            }
        }

        // Anything still up after being asked is now in the way of a file the
        // installer must replace, so it is ended.
        foreach (var p in Find(installDir))
        {
            try
            {
                Log.Write($"process {p.Id} did not close; ending it");
                p.Kill(entireProcessTree: true);
                p.WaitForExit((int)Grace.TotalMilliseconds);
            }
            catch (Exception e) when (e is InvalidOperationException or SystemException)
            {
                Log.Failure($"ending process {p.Id}", e);
            }
        }

        var stillThere = Find(installDir).Count;
        if (stillThere > 0)
        {
            Log.Write($"{stillThere} process(es) still running after being ended");
            return false;
        }

        return true;
    }

    /// <summary>
    /// TechDesk processes belonging to this install. Matched on the executable
    /// path, not just the name: another program called TechDesk.exe somewhere
    /// else on the PC is none of this installer's business.
    /// </summary>
    private static List<Process> Find(string installDir)
    {
        var found = new List<Process>();
        var name = Path.GetFileNameWithoutExtension(Target.ExeName);

        Process[] candidates;
        try
        {
            candidates = Process.GetProcessesByName(name);
        }
        catch (Exception e) when (e is InvalidOperationException or SystemException)
        {
            Log.Failure("listing processes", e);
            return found;
        }

        foreach (var p in candidates)
        {
            string? exe = null;
            try
            {
                exe = p.MainModule?.FileName;
            }
            catch (Exception e) when (e is InvalidOperationException or SystemException)
            {
                // Access denied reading another user's process. If we cannot
                // see where it runs from we cannot claim it is ours, and
                // killing a process we have not identified is not acceptable.
                Log.Write($"cannot read path of process {p.Id}; leaving it alone");
            }

            if (exe is not null && IsInside(exe, installDir))
            {
                found.Add(p);
            }
            else
            {
                p.Dispose();
            }
        }

        return found;
    }

    private static bool IsInside(string file, string dir)
    {
        try
        {
            var f = Path.GetFullPath(file);
            var d = Path.GetFullPath(dir).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            return f.StartsWith(d, StringComparison.OrdinalIgnoreCase);
        }
        catch (Exception e) when (e is ArgumentException or PathTooLongException or NotSupportedException)
        {
            return false;
        }
    }
}
