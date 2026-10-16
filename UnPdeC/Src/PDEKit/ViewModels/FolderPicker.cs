using System.Runtime.InteropServices;

namespace PDEKit.ViewModels;

/// <summary>
/// 使用 Windows Shell COM API 的文件夹选择对话框
/// 不依赖 System.Windows.Forms，避免命名空间冲突
/// </summary>
internal class FolderPicker
{
    public string Title { get; set; } = "选择文件夹";
    public string ResultPath { get; private set; } = "";

    public bool? ShowDialog()
    {
        var dialog = (IFileOpenDialog)new FileOpenDialog();
        try
        {
            // 设置为文件夹选择模式
            dialog.SetOptions(FOS.FOS_PICKFOLDERS | FOS.FOS_FORCEFILESYSTEM);

            dialog.SetTitle(Title);

            // 设置默认文件夹为桌面
            var desktopGuid = new Guid("00021400-0000-0000-C000-000000000046");
            var hrDesktop = SHGetKnownFolderItem(desktopGuid, 0, IntPtr.Zero, typeof(IShellItem).GUID, out var desktopItemPtr);
            if (hrDesktop == 0 && desktopItemPtr != 0)
            {
                var desktopItem = (IShellItem)Marshal.GetObjectForIUnknown(desktopItemPtr);
                dialog.SetDefaultFolder(desktopItem);
                Marshal.Release(desktopItemPtr);
            }

            var hr = dialog.Show(IntPtr.Zero);
            if (hr != 0) // 用户取消或其他错误
            {
                return false;
            }

            dialog.GetResult(out var resultItem);
            if (resultItem != null)
            {
                resultItem.GetDisplayName(SIGDN.SIGDN_FILESYSPATH, out var pNamePtr);
                ResultPath = Marshal.PtrToStringUni(pNamePtr) ?? "";
                Marshal.FreeCoTaskMem(pNamePtr);
                return true;
            }

            return false;
        }
        finally
        {
            Marshal.ReleaseComObject(dialog);
        }
    }

    #region COM Interop

    [ComImport]
    [Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
    private class FileOpenDialog { }

    [ComImport]
    [Guid("d57c7288-d4ad-4768-be02-9d969532d960")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IFileOpenDialog
    {
        [PreserveSig] int Show(IntPtr parent);
        void SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
        void SetFileTypeIndex(uint iFileType);
        void GetFileTypeIndex(out uint piFileType);
        void Advise(IntPtr pfde, out uint pdwCookie);
        void Unadvise(uint dwCookie);
        void SetOptions(FOS fos);
        void GetOptions(out FOS pfos);
        void SetDefaultFolder(IShellItem psi);
        void SetFolder(IShellItem psi);
        void GetFolder(out IShellItem ppsi);
        void GetCurrentSelection(out IShellItem ppsi);
        void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
        void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
        void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
        void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
        void GetResult(out IShellItem ppsi);
        void AddPlace(IShellItem psi, int fdap);
        void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
        void Close(int hr);
        void SetClientGuid(ref Guid guid);
        void ClearClientData();
        void SetFilter(IntPtr pFilter);
        void GetResults(out IntPtr ppenum);
        void GetSelectedItems(out IntPtr ppsai);
    }

    [ComImport]
    [Guid("43826d1e-e718-42ee-bc55-a1e261c979ac")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellItem
    {
        void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
        void GetParent(out IShellItem ppsi);
        void GetDisplayName(SIGDN sigdnName, out nint ppszName);
        void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
        void Compare(IShellItem psi, uint hint, out int piOrder);
    }

    [DllImport("shell32.dll")]
    private static extern int SHGetKnownFolderItem(
        [MarshalAs(UnmanagedType.LPStruct)] Guid rfid,
        uint dwFlags,
        IntPtr hToken,
        [MarshalAs(UnmanagedType.LPStruct)] Guid riid,
        out nint ppv);

    [Flags]
    private enum FOS : uint
    {
        FOS_PICKFOLDERS = 0x00000020,
        FOS_FORCEFILESYSTEM = 0x00000040,
    }

    private enum SIGDN : uint
    {
        SIGDN_FILESYSPATH = 0x80058000,
    }

    #endregion
}
