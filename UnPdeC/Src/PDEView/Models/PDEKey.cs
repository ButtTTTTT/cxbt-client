namespace PDEView.Models;

public static class PDEKey
{
    private static readonly byte[] _key = new byte[0x1000];
    private static bool _initialized = false;

    public static byte[] GetKey()
    {
        if (!_initialized)
        {
            GenerateKey();
        }
        return _key;
    }

    private static void GenerateKey()
    {
        uint eax = 0x42574954;

        for (int i = 0; i < 0x1000; i++)
        {
            eax *= 0x7FCF;
            _key[i] = (byte)((eax >> 24) ^ ((eax >> 16) & 0xFF) ^ ((eax >> 8) & 0xFF) ^ (eax & 0xFF));
        }

        _initialized = true;
    }

    public static void XorData(byte[] data, ulong startOffset = 0)
    {
        var key = GetKey();
        for (int i = 0; i < data.Length; i++)
        {
            data[i] ^= key[(startOffset + (ulong)i) % 0x1000UL];
        }
    }
    
    public static void XorData(byte[] data, int dataOffset, int length, ulong fileOffset)
    {
        var key = GetKey();
        for (int i = 0; i < length; i++)
        {
            data[dataOffset + i] ^= key[(fileOffset + (ulong)i) % 0x1000UL];
        }
    }
}
