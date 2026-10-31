using System.Windows;
using TechDesk.Setup.Engine;

namespace TechDesk.Setup;

/// <summary>
/// Where the installer starts, and the gate that decides whether any of WPF
/// is loaded at all.
///
/// This exists because of what happens on the unattended path. When the
/// desktop app updates itself, electron-updater runs this .exe with /S while
/// the app is quitting -- no desktop session worth speaking of, nobody
/// watching. If that run constructs a WPF Application, WPF goes on to create
/// a hidden message window for it even though no window is ever shown
/// (Application.RunInternal calls EnsureHwndSource when there is no main
/// window). That is a window-system dependency taken on for no reason by the
/// one code path that most needs to be dependable, and it was a real crash,
/// not a theoretical one: under a bare X server the hidden window fails to
/// create and the whole update dies with a Win32Exception from deep inside
/// HwndWrapper.
///
/// So the split is deliberate: everything that does not need to draw runs
/// here, with no Application, no dispatcher and no window. Only an
/// interactive install -- a person at the PC, who is going to see the
/// animated window -- brings WPF up, and when it does there is always a real
/// window for it to run, which is the case WPF is built for.
///
/// MessageBox is used directly for the uninstall questions. It is a thin
/// wrapper over the Win32 dialog and needs no Application behind it.
/// </summary>
internal static class Program
{
    private const int Ok = 0;
    private const int Failed = 1;

    [STAThread]
    public static int Main(string[] args)
    {
        var options = CommandLine.Parse(args);
        Log.Write($"--- TechDesk Setup {BuildInfo.Version} :: {options.Describe()}");

        try
        {
            if (options.Silent)
            {
                return RunSilently(options);
            }

            if (options.Mode == SetupMode.Uninstall)
            {
                return UninstallWithQuestions();
            }

            // A person is here. This is the only path that needs WPF.
            var app = new App { Options = options };
            app.InitializeComponent();
            return app.Run();
        }
        catch (Exception error)
        {
            Log.Failure("the installer", error);
            if (!options.Silent)
            {
                MessageBox.Show(
                    $"{Target.ProductName} Setup could not continue.\n\n{error.Message}"
                    + $"\n\nDetails were written to:\n{Log.FilePath}",
                    $"{Target.ProductName} Setup",
                    MessageBoxButton.OK,
                    MessageBoxImage.Error);
            }

            return Failed;
        }
    }

    private static int RunSilently(CommandLine options)
    {
        try
        {
            if (options.Mode == SetupMode.Uninstall)
            {
                // Nobody to ask, so the shop's records are kept. See
                // Uninstaller for why that is the only safe default.
                new Uninstaller().Run(alsoRemoveData: false);
                return Ok;
            }

            var installer = new Installer(options);
            installer.Run(progress: null, CancellationToken.None);

            if (options.ForceRun)
            {
                installer.Launch();
            }

            return Ok;
        }
        catch (Exception error)
        {
            // No window to show this in and nobody to read it, so the log is
            // the only record there will ever be, and the exit code is all
            // electron-updater gets.
            Log.Failure("the silent install", error);
            return Failed;
        }
    }

    private static int UninstallWithQuestions()
    {
        var answer = MessageBox.Show(
            $"Remove {Target.ProductName} from this computer?",
            $"Uninstall {Target.ProductName}",
            MessageBoxButton.YesNo,
            MessageBoxImage.Question);

        if (answer != MessageBoxResult.Yes)
        {
            Log.Write("uninstall cancelled");
            return Ok;
        }

        // Asked separately, and phrased so the safe answer is the obvious
        // one: this folder is every sale, repair and customer the shop has
        // ever recorded.
        var removeData = false;
        if (Uninstaller.HasData)
        {
            removeData = MessageBox.Show(
                "Also delete this shop's records — sales, repairs, stock and customers?"
                + "\n\nChoose No to keep them, so they are still here if "
                + $"{Target.ProductName} is installed again.",
                "Keep the shop's records?",
                MessageBoxButton.YesNo,
                MessageBoxImage.Warning,
                MessageBoxResult.No) == MessageBoxResult.Yes;
        }

        try
        {
            new Uninstaller().Run(removeData);
            return Ok;
        }
        catch (Exception error)
        {
            Log.Failure("the uninstall", error);
            MessageBox.Show(
                $"{Target.ProductName} could not be fully removed.\n\n{error.Message}"
                + $"\n\nDetails were written to:\n{Log.FilePath}",
                $"Uninstall {Target.ProductName}",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
            return Failed;
        }
    }
}
