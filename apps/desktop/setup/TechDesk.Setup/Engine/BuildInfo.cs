using System.Reflection;

namespace TechDesk.Setup.Engine;

/// <summary>
/// The version this installer carries, taken from the assembly rather than
/// written here, so there is exactly one place a release number lives:
/// apps/desktop/package.json, which the build script passes to the compiler.
/// A number typed into the installer as well would eventually disagree with
/// the app it installs.
/// </summary>
internal static class BuildInfo
{
    public static string Version { get; } = Read();

    private static string Read()
    {
        var info = typeof(BuildInfo).Assembly
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion;

        if (!string.IsNullOrWhiteSpace(info))
        {
            // Strips the source-revision suffix the SDK appends ("4.18.0+abc123").
            var plus = info.IndexOf('+', StringComparison.Ordinal);
            return plus > 0 ? info[..plus] : info;
        }

        var v = typeof(BuildInfo).Assembly.GetName().Version;
        return v is null ? "0.0.0" : $"{v.Major}.{v.Minor}.{v.Build}";
    }
}
