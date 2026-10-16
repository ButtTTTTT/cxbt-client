using System;
using System.Windows.Input;

namespace FCM2 {
	public class RelayCommand : ICommand {
		private readonly Action execute;
		private readonly Func<bool>? canExecute;

		public event EventHandler? CanExecuteChanged {
			add => CommandManager.RequerySuggested += value;
			remove => CommandManager.RequerySuggested -= value;
		}

		public RelayCommand(Action execute, Func<bool>? canExecute = null) {
			this.execute = execute ?? throw new ArgumentNullException(nameof(execute));
			this.canExecute = canExecute;
		}

		public bool CanExecute(object? parameter) {
			return canExecute?.Invoke() ?? true;
		}

		public void Execute(object? parameter) {
			execute();
		}
	}

	public class RelayCommand<T> : ICommand {
		private readonly Action<T?> execute;
		private readonly Func<T?, bool>? canExecute;

		public event EventHandler? CanExecuteChanged {
			add => CommandManager.RequerySuggested += value;
			remove => CommandManager.RequerySuggested -= value;
		}

		public RelayCommand(Action<T?> execute, Func<T?, bool>? canExecute = null) {
			this.execute = execute ?? throw new ArgumentNullException(nameof(execute));
			this.canExecute = canExecute;
		}

		public bool CanExecute(object? parameter) {
			return canExecute?.Invoke((T?)parameter) ?? true;
		}

		public void Execute(object? parameter) {
			execute((T?)parameter);
		}
	}
}
