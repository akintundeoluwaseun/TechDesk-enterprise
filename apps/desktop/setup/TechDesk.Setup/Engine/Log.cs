using System.Diagnostics;
using System.Text;

namespace TechDesk.Setup.Engine;

/// <summary>
/// A line-by-line record of what the installer did, in %TEMP%.
///
/// This exists for one situation: an update that failed on a PC in a shop in
/// another city. electron-updater runs this installer with /S when the app
/// quits -- no window, nobody watching, and if it goes wrong the only thing
/// anyone can do afterwards is read this file. Without it a silent failure is
/// invisible, which is the worst kind.
///
/// Never throws: a logger that can break the install it is recording is worse
/// than no logger.
/// </summary>
internal static class Log
{
    private static readonly object Gate = new();
    private static readonly string Path = System.IO.Path.Combine(
        System.IO.Path.GetTempPath(), "TechDesk-Setup.log");

    public static string FilePath => Path;

    public static void Write(string message)
    {
        try
        {
            lock (Gate)
            {
                // Appended, not replaced: an update that fails and is retried
                // leaves both attempts, and the pair is usually the answer.
                File.AppendAllText(
                    Path,
                    $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} {message}{Environment.NewLine}",
                    Encoding.UTF8);
            }
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or System.Security.SecurityException)
        {
            // A full or read-only %TEMP% must not stop the install.
            Debug.WriteLine(message);
        }
    }

    public static void Failure(string what, Exception error) =>
        Write($"FAILED {what}: {error.GetType().Name}: {error.Message}");
}
