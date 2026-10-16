using System.Windows;
using PDEView.Services;

namespace PDEView
{
    public partial class ExportOptionsWindow : Window
    {
        public ExtractMode SelectedMode { get; private set; }
        public bool IsConfirmed { get; private set; }
        private bool _isDirectoryMode;

        public ExportOptionsWindow()
        {
            InitializeComponent();
            SelectedMode = ExtractMode.NoExtract;
            IsConfirmed = false;
            _isDirectoryMode = false;
        }

        public ExportOptionsWindow(ExtractMode defaultMode, bool isDirectoryMode = false) : this()
        {
            _isDirectoryMode = isDirectoryMode;
            
            if (isDirectoryMode)
            {
                gbNoExtract.Visibility = Visibility.Collapsed;
                Title = "导出选项（目录模式）";
                
                if (defaultMode == ExtractMode.NoExtract)
                {
                    defaultMode = ExtractMode.KeepFirst8Bytes;
                }
            }

            switch (defaultMode)
            {
                case ExtractMode.NoExtract:
                    rbNoExtract.IsChecked = true;
                    break;
                case ExtractMode.RemoveFirst8Bytes:
                    rbRemove8Bytes.IsChecked = true;
                    break;
                case ExtractMode.KeepFirst8Bytes:
                    rbKeep8Bytes.IsChecked = true;
                    break;
                case ExtractMode.Mixed:
                    rbMixed.IsChecked = true;
                    break;
            }
        }

        private void BtnOK_Click(object sender, RoutedEventArgs e)
        {
            if (rbNoExtract.IsChecked == true)
            {
                SelectedMode = ExtractMode.NoExtract;
            }
            else if (rbRemove8Bytes.IsChecked == true)
            {
                SelectedMode = ExtractMode.RemoveFirst8Bytes;
            }
            else if (rbKeep8Bytes.IsChecked == true)
            {
                SelectedMode = ExtractMode.KeepFirst8Bytes;
            }
            else if (rbMixed.IsChecked == true)
            {
                SelectedMode = ExtractMode.Mixed;
            }

            IsConfirmed = true;
            DialogResult = true;
            Close();
        }

        private void BtnCancel_Click(object sender, RoutedEventArgs e)
        {
            IsConfirmed = false;
            DialogResult = false;
            Close();
        }
    }
}
