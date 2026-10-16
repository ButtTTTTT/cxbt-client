package unluac.decompile;

import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.Charset;

public class FileOutputProvider implements OutputProvider {
  
  private final Writer writer;
  private final String eol;
  
  public FileOutputProvider(FileOutputStream out) {
    this.writer = new OutputStreamWriter(out, Charset.forName("UTF-8"));
    eol = System.lineSeparator();
  }
  
  @Override
  public void print(String s) {
    try {
      writer.write(s);
    } catch(IOException e) {
      throw new RuntimeException(e.getMessage());
    }
  }

  @Override
  public void print(byte b) {
    try {
      writer.write((char)(b & 0xFF));
    } catch(IOException e) {
      throw new RuntimeException(e.getMessage());
    }
  }
  
  @Override
  public void println() {
    print(eol);
  }
  
  @Override
  public void finish() {
   try {
     writer.flush();
     writer.close();
    } catch(IOException e) {
      throw new RuntimeException(e.getMessage());
    }
  }
  
}
