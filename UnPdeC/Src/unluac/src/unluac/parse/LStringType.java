package unluac.parse;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.Charset;

import unluac.Version;


public abstract class LStringType extends BObjectType<LString> {

  public static LStringType get(Version.StringType type) {
    switch(type) {
      case LUA50: return new LStringType50();
      case LUA53: return new LStringType53();
      case LUA54: return new LStringType54();
      default: throw new IllegalStateException();
    }
  }
  
  protected ThreadLocal<StringBuilder> b = new ThreadLocal<StringBuilder>() {
    
    @Override
    protected StringBuilder initialValue() {
      return new StringBuilder();  
    }

  };
  
  protected static boolean isValidUTF8(byte[] bytes) {
    int i = 0;
    while (i < bytes.length) {
      byte b = bytes[i];
      if ((b & 0x80) == 0) {
        i++;
      } else if ((b & 0xE0) == 0xC0) {
        if (i + 1 >= bytes.length) return false;
        if ((bytes[i + 1] & 0xC0) != 0x80) return false;
        int codepoint = ((b & 0x1F) << 6) | (bytes[i + 1] & 0x3F);
        if (codepoint < 0x80) return false;
        i += 2;
      } else if ((b & 0xF0) == 0xE0) {
        if (i + 2 >= bytes.length) return false;
        if ((bytes[i + 1] & 0xC0) != 0x80) return false;
        if ((bytes[i + 2] & 0xC0) != 0x80) return false;
        int codepoint = ((b & 0x0F) << 12) | ((bytes[i + 1] & 0x3F) << 6) | (bytes[i + 2] & 0x3F);
        if (codepoint < 0x800) return false;
        i += 3;
      } else if ((b & 0xF8) == 0xF0) {
        if (i + 3 >= bytes.length) return false;
        if ((bytes[i + 1] & 0xC0) != 0x80) return false;
        if ((bytes[i + 2] & 0xC0) != 0x80) return false;
        if ((bytes[i + 3] & 0xC0) != 0x80) return false;
        int codepoint = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3F) << 12) | ((bytes[i + 2] & 0x3F) << 6) | (bytes[i + 3] & 0x3F);
        if (codepoint < 0x10000 || codepoint > 0x10FFFF) return false;
        i += 4;
      } else {
        return false;
      }
    }
    return true;
  }
  
  protected static boolean hasChineseUTF8(byte[] bytes) {
    int i = 0;
    while (i < bytes.length) {
      byte b = bytes[i];
      if ((b & 0x80) == 0) {
        i++;
      } else if ((b & 0xE0) == 0xC0) {
        i += 2;
      } else if ((b & 0xF0) == 0xE0) {
        if (i + 2 < bytes.length) {
          int codepoint = ((b & 0x0F) << 12) | ((bytes[i + 1] & 0x3F) << 6) | (bytes[i + 2] & 0x3F);
          if (codepoint >= 0x4E00 && codepoint <= 0x9FFF) {
            return true;
          }
        }
        i += 3;
      } else if ((b & 0xF8) == 0xF0) {
        i += 4;
      } else {
        i++;
      }
    }
    return false;
  }
  
  protected static String detectEncoding(byte[] bytes, String defaultEncoding) {
    if (isValidUTF8(bytes) && hasChineseUTF8(bytes)) {
      return "UTF-8";
    }
    return defaultEncoding;
  }
  
  protected static String decodeString(byte[] bytes, int offset, int length, String defaultEncoding) {
    byte[] content = bytes;
    if (offset != 0 || length != bytes.length) {
      content = new byte[length];
      System.arraycopy(bytes, offset, content, 0, length);
    }
    String encoding = detectEncoding(content, defaultEncoding);
    try {
      return new String(content, Charset.forName(encoding));
    } catch (Exception e) {
      return new String(content);
    }
  }
  
}

class LStringType50 extends LStringType {
  
  @Override
  public LString parse(final ByteBuffer buffer, BHeader header) {
    BInteger sizeT = header.sizeT.parse(buffer, header);
    ByteArrayOutputStream baos = new ByteArrayOutputStream();
    sizeT.iterate(new Runnable() {
      
      @Override
      public void run() {
        baos.write(buffer.get());
      }
      
    });
    if(baos.size() == 0) {
      return LString.NULL;
    } else {
      byte[] bytes = baos.toByteArray();
      String s = decodeString(bytes, 0, bytes.length - 1, header.encoding);
      if(header.debug) {
        System.out.println("-- parsed <string> \"" + s + "\"");
      }
      return new LString(s, (char)(bytes[bytes.length - 1] & 0xFF));
    }
  }
  
  @Override
  public void write(OutputStream out, BHeader header, LString string) throws IOException {
    int len = string.value.length();
    if(string == LString.NULL) {
      header.sizeT.write(out, header, header.sizeT.create(0));
    } else {
      header.sizeT.write(out, header, header.sizeT.create(len + 1));
      for(int i = 0; i < len; i++) {
        out.write(string.value.charAt(i));
      }
      out.write(0);
    }
  }
}

class LStringType53 extends LStringType {
  
  @Override
  public LString parse(final ByteBuffer buffer, BHeader header) {
    BInteger sizeT;
    int size = 0xFF & buffer.get();
    if(size == 0) {
      return LString.NULL;
    } else if(size == 0xFF) {
      sizeT = header.sizeT.parse(buffer, header);
    } else {
      sizeT = new BInteger(size);
    }
    ByteArrayOutputStream baos = new ByteArrayOutputStream();
    sizeT.iterate(new Runnable() {
      
      boolean first = true;
      
      @Override
      public void run() {
        if(!first) {
          baos.write(buffer.get());
        } else {
          first = false;
        }
      }
      
    });
    byte[] bytes = baos.toByteArray();
    String s = decodeString(bytes, 0, bytes.length, header.encoding);
    if(header.debug) {
      System.out.println("-- parsed <string> \"" + s + "\"");
    }
    return new LString(s);
  }
  
  @Override
  public void write(OutputStream out, BHeader header, LString string) throws IOException {
    if(string == LString.NULL) {
      out.write(0);
    } else {
      int len = string.value.length() + 1;
      if(len < 0xFF) {
        out.write((byte)len);
      } else {
        out.write(0xFF);
        header.sizeT.write(out, header, header.sizeT.create(len));
      }
      for(int i = 0; i < string.value.length(); i++) {
        out.write(string.value.charAt(i));
      }
    }
  }
}

class LStringType54 extends LStringType {
  
  @Override
  public LString parse(final ByteBuffer buffer, BHeader header) {
    BInteger sizeT = header.sizeT.parse(buffer, header);
    if(sizeT.asInt() == 0) {
      return LString.NULL;
    }
    ByteArrayOutputStream baos = new ByteArrayOutputStream();
    sizeT.iterate(new Runnable() {
      
      boolean first = true;
      
      @Override
      public void run() {
        if(!first) {
          baos.write(buffer.get());
        } else {
          first = false;
        }
      }
      
    });
    byte[] bytes = baos.toByteArray();
    String s = decodeString(bytes, 0, bytes.length, header.encoding);
    if(header.debug) {
      System.out.println("-- parsed <string> \"" + s + "\"");
    }
    return new LString(s);
  }
  
  @Override
  public void write(OutputStream out, BHeader header, LString string) throws IOException {
    if(string == LString.NULL) {
      header.sizeT.write(out, header, header.sizeT.create(0));
    } else {
      header.sizeT.write(out, header, header.sizeT.create(string.value.length() + 1));
      for(int i = 0; i < string.value.length(); i++) {
        out.write(string.value.charAt(i));
      }
    }
  }
}

