using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using TechDesk.Setup.Engine;

namespace TechDesk.Setup;

public partial class MainWindow : Window
{
    private const double BarWidth = 470;
    private const double StepHeight = 44;

    private readonly CommandLine options;
    private readonly CancellationTokenSource cancel = new();
    private Storyboard? ambient;
    private Page current = Page.Welcome;
    private bool installing;
    private bool finished;

    private enum Page
    {
        Welcome = 0,
        Location = 1,
        Installing = 2,
        Done = 3,
        Trouble = 4,
    }

    /// <summary>
    /// Windows' own "animate controls and elements inside windows" setting.
    /// Someone who has turned animation off has usually done it because
    /// motion makes them ill or because the PC is too slow for it, and an
    /// installer is not the place to overrule either. Everything still
    /// happens, just immediately.
    /// </summary>
    private static bool Motion => SystemParameters.ClientAreaAnimation;

    private static Duration Over(double seconds) =>
        new(TimeSpan.FromSeconds(Motion ? seconds : 0));

    internal MainWindow(CommandLine options)
    {
        this.options = options;
        InitializeComponent();

        RailVersion.Text = $"SETUP {BuildInfo.Version}";
        PathText.Text = new Installer(options).InstallDir;
        BuildWelcomePoints();

        // An update already knows everything it needs: electron-updater
        // passed --updated because the app is replacing itself. Asking "shall
        // I install?" at that point is a question with one answer, so it goes
        // straight to work.
        Loaded += (_, _) =>
        {
            Show(Page.Welcome, animate: false);
            ((Storyboard)Resources["Enter"]).Begin(this);

            if (options.Updated)
            {
                Start();
            }
        };

        MouseLeftButtonDown += (_, e) =>
        {
            // The window has no title bar, so the whole panel is the handle.
            if (e.ButtonState == MouseButtonState.Pressed)
            {
                DragMove();
            }
        };
    }

    private void BuildWelcomePoints()
    {
        var points = new[]
        {
            "Sales, repairs, stock and customers, all on this PC",
            "Works with no internet; nothing has to be online",
            "No administrator password needed",
        };

        foreach (var p in points)
        {
            var row = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 9) };
            row.Children.Add(new System.Windows.Shapes.Ellipse
            {
                Width = 5,
                Height = 5,
                Fill = (Brush)FindResource("Cyan"),
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(2, 0, 12, 0),
            });
            row.Children.Add(new TextBlock
            {
                Text = p,
                FontSize = 13.5,
                Foreground = (Brush)FindResource("Muted"),
            });
            WelcomePoints.Children.Add(row);
        }
    }

    // ---------------------------------------------------------------- pages

    private Grid PanelFor(Page p) => p switch
    {
        Page.Welcome => PageWelcome,
        Page.Location => PageLocation,
        Page.Installing => PageInstalling,
        Page.Done => PageDone,
        _ => PageTrouble,
    };

    private TranslateTransform? SlideFor(Page p) => p switch
    {
        Page.Welcome => WelcomeSlide,
        Page.Location => LocationSlide,
        Page.Installing => InstallingSlide,
        Page.Done => DoneSlide,
        _ => null,
    };

    /// <summary>
    /// Moves to a page: the one leaving slides a little to the left as it
    /// fades, the one arriving comes in from the right. Overlapping, so it
    /// reads as one movement rather than two.
    /// </summary>
    private void Show(Page next, bool animate = true)
    {
        var leaving = current;
        current = next;

        var incoming = PanelFor(next);
        incoming.Visibility = Visibility.Visible;

        MovePill(next, animate);

        if (!animate || !Motion)
        {
            foreach (Page p in Enum.GetValues<Page>())
            {
                var panel = PanelFor(p);
                panel.Opacity = p == next ? 1 : 0;
                panel.Visibility = p == next ? Visibility.Visible : Visibility.Collapsed;
            }

            if (next == Page.Installing)
            {
                StartAmbient();
            }

            return;
        }

        if (leaving != next)
        {
            var outgoing = PanelFor(leaving);
            var outSlide = SlideFor(leaving);
            var fadeOut = new Storyboard();

            var o = new DoubleAnimation(outgoing.Opacity, 0, Over(0.17));
            Storyboard.SetTarget(o, outgoing);
            Storyboard.SetTargetProperty(o, new PropertyPath(OpacityProperty));
            fadeOut.Children.Add(o);

            if (outSlide is not null)
            {
                var x = new DoubleAnimation(0, -26, Over(0.17))
                {
                    EasingFunction = (IEasingFunction)FindResource("Settle"),
                };
                Storyboard.SetTarget(x, outSlide);
                Storyboard.SetTargetProperty(x, new PropertyPath(TranslateTransform.XProperty));
                fadeOut.Children.Add(x);
            }

            fadeOut.Completed += (_, _) => outgoing.Visibility = Visibility.Collapsed;
            fadeOut.Begin();
        }

        var slide = SlideFor(next);
        if (slide is not null)
        {
            slide.X = 34;
        }

        var arrive = new Storyboard();
        var fadeIn = new DoubleAnimation(0, 1, Over(0.32)) { BeginTime = TimeSpan.FromSeconds(Motion ? 0.09 : 0) };
        Storyboard.SetTarget(fadeIn, incoming);
        Storyboard.SetTargetProperty(fadeIn, new PropertyPath(OpacityProperty));
        arrive.Children.Add(fadeIn);

        if (slide is not null)
        {
            var toZero = new DoubleAnimation(34, 0, Over(0.40))
            {
                BeginTime = TimeSpan.FromSeconds(Motion ? 0.09 : 0),
                EasingFunction = (IEasingFunction)FindResource("Glide"),
            };
            Storyboard.SetTarget(toZero, slide);
            Storyboard.SetTargetProperty(toZero, new PropertyPath(TranslateTransform.XProperty));
            arrive.Children.Add(toZero);
        }

        arrive.Begin();

        if (next == Page.Installing)
        {
            StartAmbient();
        }
        else
        {
            StopAmbient();
        }
    }

    /// <summary>Slides the rail marker, and dims the steps not in play.</summary>
    private void MovePill(Page page, bool animate)
    {
        var index = page switch
        {
            Page.Welcome => 0,
            Page.Location => 1,
            Page.Installing => 2,
            Page.Done => 3,
            _ => 2,
        };

        var to = index * StepHeight;
        if (animate && Motion)
        {
            PillSlide.BeginAnimation(
                TranslateTransform.YProperty,
                new DoubleAnimation(to, Over(0.44))
                {
                    EasingFunction = (IEasingFunction)FindResource("Glide"),
                });
        }
        else
        {
            PillSlide.BeginAnimation(TranslateTransform.YProperty, null);
            PillSlide.Y = to;
        }

        for (var i = 0; i < Steps.Children.Count; i++)
        {
            if (Steps.Children[i] is not UIElement step)
            {
                continue;
            }

            var want = i == index ? 1.0 : 0.42;
            if (animate && Motion)
            {
                step.BeginAnimation(OpacityProperty, new DoubleAnimation(want, Over(0.3)));
            }
            else
            {
                step.BeginAnimation(OpacityProperty, null);
                step.Opacity = want;
            }
        }
    }

    // ------------------------------------------------------------- ambience

    /// <summary>
    /// The looping motion on the installing page. Built here rather than in
    /// XAML so it can be stopped the moment the work finishes -- a ring still
    /// turning behind a finished tick looks like the installer has not
    /// noticed it is done.
    /// </summary>
    private void StartAmbient()
    {
        if (!Motion || ambient is not null)
        {
            return;
        }

        ambient = new Storyboard { RepeatBehavior = RepeatBehavior.Forever };

        Turn(RingOuterTurn, 0, 360, 9.0);
        Turn(RingMiddleTurn, 360, 0, 6.5);
        Turn(RingInnerTurn, 0, 360, 4.0);

        // The core breathes, a little out of step with the rings so the whole
        // thing never lines up and starts looking mechanical.
        Pulse(CoreScale, ScaleTransform.ScaleXProperty, 1, 1.22, 1.9);
        Pulse(CoreScale, ScaleTransform.ScaleYProperty, 1, 1.22, 1.9);

        // The highlight travelling along the bar.
        var sweep = new DoubleAnimation(-130, BarWidth, new Duration(TimeSpan.FromSeconds(1.6)))
        {
            RepeatBehavior = RepeatBehavior.Forever,
        };
        Storyboard.SetTarget(sweep, ShimmerSlide);
        Storyboard.SetTargetProperty(sweep, new PropertyPath(TranslateTransform.XProperty));
        ambient.Children.Add(sweep);

        ambient.Begin();

        void Turn(RotateTransform t, double from, double to, double seconds)
        {
            var a = new DoubleAnimation(from, to, new Duration(TimeSpan.FromSeconds(seconds)))
            {
                RepeatBehavior = RepeatBehavior.Forever,
            };
            Storyboard.SetTarget(a, t);
            Storyboard.SetTargetProperty(a, new PropertyPath(RotateTransform.AngleProperty));
            ambient.Children.Add(a);
        }

        void Pulse(ScaleTransform t, System.Windows.DependencyProperty p, double from, double to, double seconds)
        {
            var a = new DoubleAnimation(from, to, new Duration(TimeSpan.FromSeconds(seconds)))
            {
                AutoReverse = true,
                RepeatBehavior = RepeatBehavior.Forever,
                EasingFunction = (IEasingFunction)FindResource("Settle"),
            };
            Storyboard.SetTarget(a, t);
            Storyboard.SetTargetProperty(a, new PropertyPath(p));
            ambient.Children.Add(a);
        }
    }

    private void StopAmbient()
    {
        ambient?.Stop();
        ambient = null;
    }

    // ------------------------------------------------------------- progress

    private void Report(InstallProgress p)
    {
        StageText.Text = p.Stage;
        PercentText.Text = $"{Math.Round(p.Fraction * 100)}%";

        var to = Math.Clamp(p.Fraction, 0, 1) * BarWidth;
        if (Motion)
        {
            // Animated to the new value, so a jump from 12% to 40% glides.
            BarTrack.BeginAnimation(
                WidthProperty,
                new DoubleAnimation(to, Over(0.45))
                {
                    EasingFunction = (IEasingFunction)FindResource("Settle"),
                });
        }
        else
        {
            BarTrack.BeginAnimation(WidthProperty, null);
            BarTrack.Width = to;
        }
    }

    // -------------------------------------------------------------- actions

    private void OnInstall(object sender, RoutedEventArgs e) => Start();

    private void OnChoose(object sender, RoutedEventArgs e) => Show(Page.Location);

    private void OnBack(object sender, RoutedEventArgs e) => Show(Page.Welcome);

    private void OnRetry(object sender, RoutedEventArgs e) => Start();

    private void OnResetPath(object sender, RoutedEventArgs e) =>
        PathText.Text = Target.DefaultInstallDir;

    private void OnStart(object sender, RoutedEventArgs e)
    {
        new Installer(WithChosenDir()).Launch();
        Close();
    }

    private void OnClose(object sender, RoutedEventArgs e)
    {
        if (installing && !finished)
        {
            var leave = MessageBox.Show(
                $"{Target.ProductName} is still being installed. Stop now?"
                + "\n\nNothing on this PC has been changed yet.",
                "Stop installing?",
                MessageBoxButton.YesNo,
                MessageBoxImage.Question,
                MessageBoxResult.No);

            if (leave != MessageBoxResult.Yes)
            {
                return;
            }

            cancel.Cancel();
        }

        Close();
    }

    protected override void OnClosed(EventArgs e)
    {
        StopAmbient();
        cancel.Dispose();
        base.OnClosed(e);
        Application.Current?.Shutdown();
    }

    private CommandLine WithChosenDir()
    {
        var typed = PathText.Text?.Trim();
        var dir = string.IsNullOrWhiteSpace(typed) ? options.InstallDir : typed;
        return CommandLine.Parse(BuildArgs(dir));
    }

    private string[] BuildArgs(string? dir)
    {
        var args = new List<string>();
        if (options.Updated)
        {
            args.Add("--updated");
        }

        if (options.ForceRun)
        {
            args.Add("--force-run");
        }

        if (!string.IsNullOrWhiteSpace(dir))
        {
            args.Add($"/D={dir}");
        }

        return args.ToArray();
    }

    private void Start()
    {
        if (installing)
        {
            return;
        }

        installing = true;
        finished = false;
        InstallButton.IsEnabled = false;
        ConfirmButton.IsEnabled = false;
        CloseButton.Visibility = Visibility.Visible;

        Show(Page.Installing);
        Report(new InstallProgress("Getting ready", 0.01));

        var chosen = WithChosenDir();
        var installer = new Installer(chosen);

        // Created here, on the UI thread, so every report arrives back on the
        // UI thread without the engine knowing anything about windows.
        var progress = new Progress<InstallProgress>(p =>
        {
            Report(p);
            FileText.Text = string.Empty;
        });

        var token = cancel.Token;
        Task.Run(() => installer.Run(progress, token))
            .ContinueWith(
                t => Settle(t, installer),
                CancellationToken.None,
                TaskContinuationOptions.None,
                TaskScheduler.FromCurrentSynchronizationContext());
    }

    private void Settle(Task task, Installer installer)
    {
        installing = false;

        if (task.IsCanceled || (task.Exception?.InnerException is OperationCanceledException))
        {
            Log.Write("install stopped by the person running it");
            Close();
            return;
        }

        if (task.Exception is not null)
        {
            var error = task.Exception.InnerException ?? task.Exception;
            Log.Failure("the install", error);
            StopAmbient();
            TroubleText.Text = error.Message;
            TroubleLog.Text = $"What happened was written to:\n{Log.FilePath}";
            Show(Page.Trouble);
            return;
        }

        finished = true;
        StopAmbient();
        Report(new InstallProgress("Done", 1));

        DoneWhere.Text = $"It is installed at {installer.InstallDir}, with a shortcut on your desktop "
            + "and in the Start menu.";

        // An older per-machine copy cannot be removed without an
        // administrator, so it is named instead of being left to puzzle over.
        var stale = Installer.StalePerMachineCopy();
        if (stale is not null)
        {
            DoneNotice.Text = "There is also an older TechDesk installed for all users on this PC, at "
                + $"{stale}. It was put there by a version before 4.16.2 and needs an administrator to "
                + "remove: open Add or remove programs and uninstall the other TechDesk entry.";
            DoneNotice.Visibility = Visibility.Visible;
        }

        Show(Page.Done);
        RevealTick();

        if (options.Updated && options.ForceRun)
        {
            installer.Launch();
            Close();
        }
    }

    /// <summary>The tick being drawn, and the single beat behind it.</summary>
    private void RevealTick()
    {
        if (!Motion)
        {
            TickClip.Rect = new Rect(0, 0, 104, 104);
            return;
        }

        TickClip.Rect = new Rect(0, 0, 0, 104);
        TickClip.BeginAnimation(
            RectangleGeometry.RectProperty,
            new RectAnimation(new Rect(0, 0, 0, 104), new Rect(0, 0, 104, 104), Over(0.5))
            {
                BeginTime = TimeSpan.FromSeconds(0.18),
                EasingFunction = (IEasingFunction)FindResource("Glide"),
            });

        DonePulse.BeginAnimation(OpacityProperty, new DoubleAnimationUsingKeyFrames
        {
            KeyFrames =
            {
                new LinearDoubleKeyFrame(0, KeyTime.FromTimeSpan(TimeSpan.Zero)),
                new LinearDoubleKeyFrame(0.9, KeyTime.FromTimeSpan(TimeSpan.FromSeconds(0.12))),
                new LinearDoubleKeyFrame(0, KeyTime.FromTimeSpan(TimeSpan.FromSeconds(0.75))),
            },
        });

        foreach (var p in new[] { ScaleTransform.ScaleXProperty, ScaleTransform.ScaleYProperty })
        {
            DonePulseScale.BeginAnimation(p, new DoubleAnimation(0.72, 1.18, Over(0.75))
            {
                EasingFunction = (IEasingFunction)FindResource("Settle"),
            });
        }
    }
}
