namespace TechDesk.Setup.Engine;

internal enum SetupMode
{
    Install,
    Uninstall,
}

/// <summary>
/// The switches this installer answers to.
///
/// This is not a design; it is an interface that already exists and must be
/// matched. When the desktop app downloads an update, electron-updater runs
/// the installer itself, on app quit, with arguments it chooses:
///
///     installer.exe --updated /S --force-run
///
/// (see NsisUpdater.doInstall in electron-updater: "--updated" always, "/S"
/// when the install is silent -- which it is, because BaseUpdater calls
/// install(true, false) as the app quits -- and "--force-run" when the app
/// should come back up afterwards.)
///
/// So /S is not a nicety. If this installer shows a window when given /S, or
/// waits for a click, every shop's automatic update stops working: there is
/// nobody at the PC to answer it. That is the single highest-consequence
/// behaviour in this project, and it is why <see cref="Silent"/> is honoured
/// before anything is drawn.
///
/// /D=path is NSIS's install-directory switch. It is last on the command line
/// and deliberately unquoted -- NSIS takes the whole remainder of the line as
/// the path, so a path with spaces arrives unquoted and must be reassembled
/// rather than split. Accepted here for the same reason: anything scripted
/// against the old installer keeps working.
/// </summary>
internal sealed class CommandLine
{
    public SetupMode Mode { get; private init; } = SetupMode.Install;

    /// <summary>No window, no questions, no waiting. Set by /S.</summary>
    public bool Silent { get; private init; }

    /// <summary>
    /// This run is an update of an existing install, not a first install.
    /// Set by --updated. It means: do not ask where to put it, do not ask
    /// anything, and keep the shop's data.
    /// </summary>
    public bool Updated { get; private init; }

    /// <summary>Start TechDesk when finished. Set by --force-run.</summary>
    public bool ForceRun { get; private init; }

    /// <summary>From /D=..., or null to use the default location.</summary>
    public string? InstallDir { get; private init; }

    public static CommandLine Parse(string[] args)
    {
        var mode = SetupMode.Install;
        var silent = false;
        var updated = false;
        var forceRun = false;
        string? dir = null;

        // The uninstaller is this same program, copied into the install folder
        // under another name. Either the explicit switch or that name selects
        // uninstall, so double-clicking it in the install folder works too.
        var own = Path.GetFileNameWithoutExtension(Environment.ProcessPath ?? string.Empty);
        if (own.StartsWith("Uninstall", StringComparison.OrdinalIgnoreCase))
        {
            mode = SetupMode.Uninstall;
        }

        for (var i = 0; i < args.Length; i++)
        {
            var a = args[i];

            // /D=... takes the rest of the command line verbatim, spaces and
            // all. Splitting it on whitespace is the classic way to lose
            // "C:\Program Files\...".
            if (a.StartsWith("/D=", StringComparison.OrdinalIgnoreCase))
            {
                dir = string.Join(' ', args.Skip(i)).Substring(3).Trim();
                break;
            }

            switch (a.ToLowerInvariant())
            {
                case "/s":
                case "-s":
                case "/silent":
                case "/verysilent":
                    silent = true;
                    break;
                case "--updated":
                    updated = true;
                    break;
                case "--force-run":
                    forceRun = true;
                    break;
                case "--uninstall":
                case "/uninstall":
                    mode = SetupMode.Uninstall;
                    break;
                default:
                    // --package-file=... is passed by electron-updater when it
                    // has downloaded a web-difference package. This installer
                    // does not produce those, so there is never one to apply;
                    // it is recorded and ignored rather than treated as an
                    // error, because failing an update over an argument we
                    // merely do not need would be worse than ignoring it.
                    if (!string.IsNullOrWhiteSpace(a))
                    {
                        Log.Write($"argument ignored: {a}");
                    }

                    break;
            }
        }

        return new CommandLine
        {
            Mode = mode,
            Silent = silent,
            Updated = updated,
            ForceRun = forceRun,
            InstallDir = string.IsNullOrWhiteSpace(dir) ? null : dir,
        };
    }

    public string Describe() =>
        $"mode={Mode} silent={Silent} updated={Updated} forceRun={ForceRun} dir={InstallDir ?? "(default)"}";
}
