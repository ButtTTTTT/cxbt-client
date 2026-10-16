using System.Windows;
using System.Windows.Controls;
using PDEKit.Pages;

namespace PDEKit
{
    public partial class MainWindow : Window
    {
        public MainWindow()
        {
            InitializeComponent();
            Loaded += MainWindow_Loaded;
        }

        private void MainWindow_Loaded(object sender, RoutedEventArgs e)
        {
            NavigateToPage(0);
        }

        /// <summary>
        /// 导航项点击事件
        /// </summary>
        private void NavRadioButton_Click(object sender, RoutedEventArgs e)
        {
            if (sender is RadioButton rb && rb.Tag is string tag && int.TryParse(tag, out int index))
            {
                NavigateToPage(index);
            }
        }

        /// <summary>
        /// 根据索引导航到对应页面
        /// 0=解包, 1=打包, 2=浏览, 3=分析, 4=日志
        /// </summary>
        private void NavigateToPage(int index)
        {
            if (ContentFrame == null) return;
            ContentFrame.Navigate(index switch
            {
                0 => new UnpackPage(),
                1 => new PackPage(),
                2 => new ViewerPage(),
                3 => new AnalysisPage(),
                4 => new LogPage(),
                _ => new UnpackPage()
            });
        }
    }
}
