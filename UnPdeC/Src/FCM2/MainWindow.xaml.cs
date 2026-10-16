using System.Windows;
using System.Windows.Input;

namespace FCM2 {
	/// <summary>
	/// Interaction logic for MainWindow.xaml
	/// </summary>
	public partial class MainWindow : Window {
		private readonly MainViewModel _viewModel;

		public MainWindow() {
			InitializeComponent();
			_viewModel = new MainViewModel();
			DataContext = _viewModel;
		}

		private void Window_Drop(object sender, DragEventArgs e) {
			if (e.Data.GetDataPresent(DataFormats.FileDrop)) {
				var files = (string[])e.Data.GetData(DataFormats.FileDrop);
				_viewModel.AddDroppedFiles(files);
			}
		}

		private void Window_DragOver(object sender, DragEventArgs e) {
			if (e.Data.GetDataPresent(DataFormats.FileDrop)) {
				e.Effects = DragDropEffects.Copy;
			} else {
				e.Effects = DragDropEffects.None;
			}
			e.Handled = true;
		}
	}
}
