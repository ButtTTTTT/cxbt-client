using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace PDEKit.Converters
{
    /// <summary>
    /// 为 TextBox 提供 Watermark（占位文本）功能的附加属性
    /// 用法: TextBox converters:Watermark.Text="提示文字"
    /// </summary>
    public static class Watermark
    {
        public static readonly DependencyProperty TextProperty =
            DependencyProperty.RegisterAttached(
                "Text",
                typeof(string),
                typeof(Watermark),
                new PropertyMetadata(string.Empty, OnTextChanged));

        public static string GetText(DependencyObject obj) => (string)obj.GetValue(TextProperty);
        public static void SetText(DependencyObject obj, string value) => obj.SetValue(TextProperty, value);

        private static readonly DependencyProperty WatermarkAdornerProperty =
            DependencyProperty.RegisterAttached(
                "WatermarkAdorner",
                typeof(WatermarkAdorner),
                typeof(Watermark),
                new PropertyMetadata(null));

        private static WatermarkAdorner? GetWatermarkAdorner(DependencyObject obj) => (WatermarkAdorner?)obj.GetValue(WatermarkAdornerProperty);
        private static void SetWatermarkAdorner(DependencyObject obj, WatermarkAdorner? value) => obj.SetValue(WatermarkAdornerProperty, value);

        private static void OnTextChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
        {
            if (d is not TextBox textBox) return;

            textBox.TextChanged -= TextBox_TextChanged;
            textBox.GotFocus -= TextBox_FocusChanged;
            textBox.LostFocus -= TextBox_FocusChanged;
            textBox.Unloaded -= TextBox_Unloaded;

            // 移除旧的装饰器
            var oldAdorner = GetWatermarkAdorner(textBox);
            if (oldAdorner != null)
            {
                oldAdorner.Detach();
                SetWatermarkAdorner(textBox, null);
            }

            var newText = (string)e.NewValue;
            if (!string.IsNullOrEmpty(newText))
            {
                textBox.TextChanged += TextBox_TextChanged;
                textBox.GotFocus += TextBox_FocusChanged;
                textBox.LostFocus += TextBox_FocusChanged;
                textBox.Unloaded += TextBox_Unloaded;

                var adorner = new WatermarkAdorner(textBox, newText);
                SetWatermarkAdorner(textBox, adorner);
                adorner.UpdateVisibility();
            }
        }

        private static void TextBox_TextChanged(object sender, TextChangedEventArgs e)
        {
            if (sender is TextBox textBox)
                GetWatermarkAdorner(textBox)?.UpdateVisibility();
        }

        private static void TextBox_FocusChanged(object sender, RoutedEventArgs e)
        {
            if (sender is TextBox textBox)
                GetWatermarkAdorner(textBox)?.UpdateVisibility();
        }

        private static void TextBox_Unloaded(object sender, RoutedEventArgs e)
        {
            if (sender is TextBox textBox)
            {
                textBox.TextChanged -= TextBox_TextChanged;
                textBox.GotFocus -= TextBox_FocusChanged;
                textBox.LostFocus -= TextBox_FocusChanged;
                textBox.Unloaded -= TextBox_Unloaded;
            }
        }
    }

    /// <summary>
    /// 在 TextBox 上绘制水印文字的 Adorner
    /// </summary>
    internal class WatermarkAdorner : System.Windows.Documents.Adorner
    {
        private readonly string _watermarkText;
        private readonly TextBox _textBox;
        private readonly System.Windows.Documents.AdornerLayer? _adornerLayer;

        public WatermarkAdorner(TextBox textBox, string watermarkText) : base(textBox)
        {
            _textBox = textBox;
            _watermarkText = watermarkText;
            _adornerLayer = System.Windows.Documents.AdornerLayer.GetAdornerLayer(textBox);
            _adornerLayer?.Add(this);
            IsHitTestVisible = false;
        }

        public void UpdateVisibility()
        {
            bool showWatermark = string.IsNullOrEmpty(_textBox.Text) && !_textBox.IsFocused;
            Visibility = showWatermark ? Visibility.Visible : Visibility.Collapsed;
        }

        public void Detach()
        {
            _adornerLayer?.Remove(this);
        }

        protected override void OnRender(DrawingContext drawingContext)
        {
            base.OnRender(drawingContext);

            var foreground = SystemColors.GrayTextBrush;
            var typeface = new Typeface(_textBox.FontFamily, _textBox.FontStyle, _textBox.FontWeight, _textBox.FontStretch);
            var fontSize = _textBox.FontSize;

            var text = new FormattedText(
                _watermarkText,
                System.Globalization.CultureInfo.CurrentCulture,
                FlowDirection.LeftToRight,
                typeface,
                fontSize,
                foreground,
                VisualTreeHelper.GetDpi(this).PixelsPerDip);

            var padding = new Point(_textBox.Padding.Left + 2, _textBox.Padding.Top + 2);
            drawingContext.DrawText(text, padding);
        }
    }
}
