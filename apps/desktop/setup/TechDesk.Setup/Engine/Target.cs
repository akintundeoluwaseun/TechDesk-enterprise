namespace TechDesk.Setup.Engine;

/// <summary>
/// Where TechDesk lives on a Windows PC, and what it is called there.
///
/// Every value here is a contract with the installer that came before, not a
/// preference. Up to 4.16.2 TechDesk was installed by NSIS, and a PC in a shop
/// today has an install NSIS made. If this installer writes its uninstall entry
/// under a different key, or installs to a different folder, Windows does not
/// see an upgrade -- it sees a second product. That is precisely the fault that
/// put two TechDesk icons on the desktop and two rows in Add/Remove Programs,
/// and 4.16.1 and 4.16.2 were spent getting rid of it.
///
/// So these are taken from what electron-builder's NSIS target actually wrote:
///   * the GUID is uuid-v5(appId "com.techdesk.app") in electron-builder's
///     namespace, which is where 8c82b694-... comes from;
///   * the install folder is $LOCALAPPDATA\Programs\{package name};
///   * the data folder is %APPDATA%\TechDesk, which is Electron's userData.
///
/// Change nothing here without checking the installed registry on a real PC.
/// </summary>
internal static class Target
{
    /// <summary>Shown to people: in the window, in Add/Remove Programs.</summary>
    public const string ProductName = "TechDesk";

    /// <summary>Electron's appId. The GUID below is derived from it.</summary>
    public const string AppId = "com.techdesk.app";

    /// <summary>
    /// uuid-v5 of <see cref="AppId"/> in electron-builder's namespace. The
    /// identity of the install as far as Windows is concerned.
    /// </summary>
    public const string AppGuid = "8c82b694-e53c-5c71-a9ac-69978103636f";

    /// <summary>package.json "name": the install folder is named after it.</summary>
    public const string PackageName = "techdesk";

    public const string ExeName = "TechDesk.exe";
    public const string ShortcutName = "TechDesk";
    public const string Publisher = "TechDesk";
    public const string HomePage = "https://www.techdesk.space";

    /// <summary>
    /// The uninstaller is a copy of this installer living in the install
    /// folder, which is how NSIS did it too.
    /// </summary>
    public const string UninstallerName = "Uninstall TechDesk.exe";

    /// <summary>Where Add/Remove Programs reads its row from.</summary>
    public static string UninstallKey =>
        $@"Software\Microsoft\Windows\CurrentVersion\Uninstall\{AppGuid}";

    /// <summary>Where the installer records what it did, for the next run.</summary>
    public static string InstallKey => $@"Software\{AppGuid}";

    public static string DefaultInstallDir => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Programs",
        PackageName);

    /// <summary>
    /// The shop's own records: sales, repairs, stock, customers. Electron's
    /// userData folder. Nothing in this installer may delete it without
    /// being asked, and an update must never touch it at all.
    /// </summary>
    public static string DataDir => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        ProductName);

    public static string DesktopShortcut => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
        ShortcutName + ".lnk");

    public static string StartMenuShortcut => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.Programs),
        ShortcutName + ".lnk");
}
