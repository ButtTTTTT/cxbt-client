using System.Windows;
using System.Windows.Controls;
using PDEKit.Services;
using PDEKit.ViewModels;

namespace PDEKit.Pages
{
    public partial class UnpackPage : Page
    {
        public XorViewModel XorViewModel { get; } = new();
        public UnpdecViewModel UnpdecViewModel { get; } = new();

        public UnpackPage()
        {
            InitializeComponent();
            DataContext = this;
        }

        private void Page_Drop(object sender, DragEventArgs e)
        {
            if (e.Data.GetDataPresent(DataFormats.FileDrop))
            {
                var paths = (string[])e.Data.GetData(DataFormats.FileDrop);
                if (paths.Length > 0)
                {
                    var path = paths[0];
                    // 根据扩展名分发到对应 ViewModel
                    if (path.EndsWith(".xor", StringComparison.OrdinalIgnoreCase))
                        UnpdecViewModel.InputPath = path;
                    else
                        XorViewModel.InputPath = path;
                }
            }
        }

        private void Page_DragOver(object sender, DragEventArgs e)
        {
            e.Effects = e.Data.GetDataPresent(DataFormats.FileDrop)
                ? DragDropEffects.Copy
                : DragDropEffects.None;
            e.Handled = true;
        }

        private void UnpackMode_Mixed(object sender, RoutedEventArgs e)
            => UnpdecViewModel.ExtractMode = UnpdecService.ExtractModeEnum.Mixed;

        private void UnpackMode_Recursive(object sender, RoutedEventArgs e)
            => UnpdecViewModel.ExtractMode = UnpdecService.ExtractModeEnum.Recursive;

        private void UnpackMode_KeepFirst8(object sender, RoutedEventArgs e)
            => UnpdecViewModel.ExtractMode = UnpdecService.ExtractModeEnum.KeepFirst8;

        private void UnpackMode_Cache(object sender, RoutedEventArgs e)
            => UnpdecViewModel.ExtractMode = UnpdecService.ExtractModeEnum.Cache;
    }
}
