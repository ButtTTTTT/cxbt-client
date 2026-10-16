namespace UnPde {
    internal class Program {
        static void Main(string[] args) {
            // 设置控制台标题
            UI.SetConsoleTitleWithVersion();

            // 打印程序信息
            UI.PrintAppInfo();

            // 查找所有Xor文件
            Tools.FindXorFile();

            // 创建一个临时列表来存储找到的Xor文件
            List<SThisXor> xorFiles = new List<SThisXor>(GlobalVars.XorArr);

            // 处理所有找到的Xor文件
            foreach (var xorFile in xorFiles) {
                // 解压选项
                Tools.GetHasCacheMode();

                // 初始化工具
                Tools.Init(xorFile);

                // 使用VFS表递归的方式解压
                RecursiveMode.ExtractRecursive();

                // 复位所有静态变量,为下次解压做准备
                GlobalVars.Reset();
                UI.PrintLine();
            }

            Console.WriteLine("\n > Xor文件解压完成!");
            UI.PrintLine();

            Console.WriteLine("按任意键退出...");
            Console.ReadKey();
        }
    }
}