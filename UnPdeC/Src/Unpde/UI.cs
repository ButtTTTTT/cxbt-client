using System.Diagnostics;
using System.Runtime.InteropServices;

namespace UnPde {
    public static class UI {
        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool SetConsoleTitle(string lpConsoleTitle);

        public static void SetConsoleTitleWithVersion() {
            try {
                // 获取当前程序的完整路径
                string filePath = System.Reflection.Assembly.GetEntryAssembly().Location;

                if (string.IsNullOrEmpty(filePath)) {
                    // 如果无法获取路径，使用默认标题
                    SetConsoleTitle("UnPde");
                    return;
                }

                // 获取版本信息
                var versionInfo = FileVersionInfo.GetVersionInfo(filePath);

                // 从结构体中提取版本号并构建标题
                string strVersion = "UnPde V:";
                strVersion += $"{versionInfo.FileMajorPart}.{versionInfo.FileMinorPart}.{versionInfo.FileBuildPart}.{versionInfo.FilePrivatePart}";

                // 设置控制台标题
                SetConsoleTitle(strVersion);
            } catch (Exception ex) {
                // 出错时使用默认标题
                SetConsoleTitle("UnPde");
                Console.WriteLine($"设置控制台标题时出错: {ex.Message}");
            }
        }

        public static void PrintAppInfo() {
            const string appInfo =
                "\n" +
                "  ███╗╗   ███╗╗ ████╗╗    ███╗╗ ███████╗╗   ███████╗╗    ████████╗╗\n" +
                "  ███║║   ███║║ █████╗╗   ███║║ ███╔╔══██╗╗ ███╔╔══██╗╗  ███╔╔════╝╝\n" +
                "  ███║║   ███║║ ███╔╔██╗╗ ███║║ ███████╔╔╝╝ ███║║  ███║║ ██████╗╗\n" +
                "  ███║║   ███║║ ███║║╚╚██╗╗██║║ ███╔╔═══╝╝  ███║║  ███║║ ███╔╔══╝╝\n" +
                "  ╚╚╚██████╔╔╝╝ ███║║ ╚╚╚████║║ ███║║       ███████╔╔╝╝  ████████╗╗\n" +
                "   ╚╚╚═════╝╝  ╚╚╚═╝╝  ╚╚╚═══╝╝ ╚╚╚═╝╝      ╚╚╚═════╝╝  ╚╚╚══════╝╝\n" +
                "-----------------------------------------------------------\n";

            Console.WriteLine(appInfo);
        }

        public static void PrintLine() {
            Console.WriteLine("-----------------------------------------------------------");
        }
    }
}