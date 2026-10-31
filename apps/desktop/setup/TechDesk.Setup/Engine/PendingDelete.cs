using System.Runtime.InteropServices;

namespace TechDesk.Setup.Engine;

/// <summary>
/// Asks Windows to delete something on the next restart.
///
/// Needed for exactly one thing: the uninstaller cannot delete itself while
/// it is running. Without this, uninstalling TechDesk leaves its own .exe and
/// the folder around it sitting on the PC forever, which looks like the
/// uninstall did not work.
/// </summary>
internal static class PendingDelete
{
    private const uint DelayUntilReboot = 0x4;

    public static void OnRestart(string path)
    {
        try
        {
            if (MoveFileEx(path, null, DelayUntilReboot))
            {
                Log.Write($"queued for deletion at next restart: {path}");
            }
            else
            {
                Log.Write($"could not queue deletion of {path} (error {Marshal.GetLastWin32Error()})");
            }
        }
        catch (Exception e) when (e is DllNotFoundException or EntryPointNotFoundException)
        {
            Log.Failure($"queueing deletion of {path}", e);
        }
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool MoveFileEx(string existing, string? newName, uint flags);
}
