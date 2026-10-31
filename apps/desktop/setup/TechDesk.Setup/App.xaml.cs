using System.Windows;
using TechDesk.Setup.Engine;

namespace TechDesk.Setup;

/// <summary>
/// The interactive installer. Reached only from <see cref="Program"/>, and
/// only when there is somebody at the PC to watch it, so it always has a real
/// window to show. Silent and uninstall runs never get here, which keeps WPF
/// out of the unattended update path entirely.
/// </summary>
public partial class App : Application
{
    /// <summary>
    /// How this run was invoked. A property rather than a constructor
    /// argument because the WPF SDK generates its own entry point for
    /// App.xaml which calls new App(); that generated Main is unused (the
    /// project's StartupObject is Program) but it still has to compile.
    /// </summary>
    internal CommandLine Options { get; init; } = CommandLine.Parse([]);

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        // Shutting down when this window closes is what makes Run() return,
        // and MainWindow is the only window there is.
        ShutdownMode = ShutdownMode.OnMainWindowClose;
        MainWindow = new MainWindow(Options);
        MainWindow.Show();
    }
}
