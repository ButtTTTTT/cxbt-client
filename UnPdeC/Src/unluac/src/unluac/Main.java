package unluac;

import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.io.PrintStream;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.channels.FileChannel;

import unluac.Configuration.Mode;
import unluac.assemble.Assembler;
import unluac.assemble.AssemblerException;
import unluac.decompile.Decompiler;
import unluac.decompile.Disassembler;
import unluac.decompile.FileOutputProvider;
import unluac.decompile.Output;
import unluac.parse.BHeader;
import unluac.parse.LFunction;
import unluac.util.FileUtils;

public class Main {

  public static String version = "1.2.3.530";
  
  public static void main(String[] args) {
    String fn = null;
    Configuration config = new Configuration();
    
    // 设置默认Lua版本为5.2-alpha
    config.lua_version = "5.2-alpha";
    config.rawstring = true;  // 默认启用rawstring
    
    for(int i = 0; i < args.length; i++) {
      String arg = args[i];
      if(arg.startsWith("-")) {
        // option
        if(arg.equals("--rawstring")) {
          config.rawstring = true;
        } else if(arg.equals("--luaj")) {
          config.luaj = true;
        } else if(arg.equals("--nodebug")) {
          config.variable = Configuration.VariableMode.NODEBUG;
        } else if(arg.equals("--disassemble")) {
          config.mode = Mode.DISASSEMBLE;
        } else if(arg.equals("--assemble")) {
          config.mode = Mode.ASSEMBLE;
        } else if(arg.equals("--skip-header")) { // 默认参数
          config.skipHeader = true;
        } else if(arg.equals("--help")) {
          config.mode = Mode.HELP;
        } else if(arg.equals("--version")) {
          config.mode = Mode.VERSION;
        } else if(arg.equals("--output") || arg.equals("-o")) {
          if(i + 1 < args.length) {
            config.output = args[i + 1];
            i++;
          } else {
            error("option \"" + arg + "\" doesn't have an argument", true);
          }
        } else if(arg.equals("--typemap")) {
          if(i + 1 < args.length) {
            config.typemap = args[i + 1];
            i++;
          } else {
            error("option \"" + arg + "\" doesn't have an argument", true);
          }
        } else if(arg.equals("--opmap")) {
          if(i + 1 < args.length) {
            config.opmap = args[i + 1];
            i++;
          } else {
            error("option \"" + arg + "\" doesn't have an argument", true);
          }
        } else if (arg.equals("--lua_version")) {
          if(i + 1 < args.length) {
            config.lua_version = args[i + 1];
            i++;
          } else {
            error("option \"" + arg + "\" doesn't have an argument", true);
          }
        } else if (arg.equals("--encoding")) {
          if(i + 1 < args.length) {
            config.encoding = args[i + 1];
            i++;
          } else {
            error("option \"" + arg + "\" doesn't have an argument", true);
          }
        } else {
          error("unrecognized option: " + arg, true);
        }
      } else if(fn == null) {
        fn = arg;
      } else {
        error("too many arguments: " + arg, true);
      }
    }
    if(fn == null && config.mode != Mode.HELP && config.mode != Mode.VERSION) {
      error("no input file provided", true);
    } else {
      switch(config.mode) {
      case HELP:
        help();
        break;
      case VERSION:
        System.out.println(version);
        break;
      case DECOMPILE: {
        LFunction lmain = null;
        try {
          lmain = file_to_function(fn, config);
        } catch(IOException e) {
          error(e.getMessage(), false);
        }
        
        // 如果没有指定输出文件，自动生成输出文件名
        if(config.output == null && fn != null) {
          File inputFile = new File(fn);
          String inputName = inputFile.getName();
          String baseName;
          
          // 处理文件扩展名,全都为.lua
          if(inputName.endsWith(".luac")) {
            baseName = inputName.substring(0, inputName.length() - 1);
          } else if(inputName.endsWith(".lua")) {
            baseName = inputName;
          } else {
            baseName = inputName;
          }
          
          // 生成输出文件名
          config.output = new File(inputFile.getParentFile(), baseName).getPath();
          System.out.println("OutPutFile: " + config.output);
        }
        
        Decompiler d = new Decompiler(lmain);
        Decompiler.State result = d.decompile();
        Output output = config.getOutput();
        d.print(result, output);
        output.finish();
        
        break;
      }
      case DISASSEMBLE: {
        LFunction lmain = null;
        try {
          lmain = file_to_function(fn, config);
        } catch(IOException e) {
          error(e.getMessage(), false);
        }
        Disassembler d = new Disassembler(lmain);
        Output output = config.getOutput();
        d.disassemble(output);
        output.finish();
        break;
      }
      case ASSEMBLE: {
        if(config.output == null) {
          error("assembler mode requires an output file", true);
        } else {
          try {
            Assembler a = new Assembler(
              config,
              FileUtils.createSmartTextFileReader(new File(fn)),
              new FileOutputStream(config.output)
            );
            a.assemble();
          } catch(IOException e) {
            error(e.getMessage(), false);
          } catch(AssemblerException e) {
            error(e.getMessage(), false);
          }
        }
        break;
      }
      default:
        throw new IllegalStateException();
      }
      System.exit(0);
    }
  }
  
  public static void error(String err, boolean usage) {
    print_unluac_string(System.err);
    System.err.print("  error: ");
    System.err.println(err);
    if(usage) {
      print_usage(System.err);
      System.err.println("For information about options, use option: --help");
    }
    System.exit(1);
  }
  
  public static void help() {
    print_unluac_string(System.out);
    print_usage(System.out);
    System.out.println("Available options are:");
    System.out.println("  --assemble        assemble given disassembly listing");
    System.out.println("  --disassemble     disassemble instead of decompile");
    System.out.println("  --nodebug         ignore debugging information in input file");
    System.out.println("  --typemap <file>  use type mapping specified in <file>");
    System.out.println("  --opmap <file>    use opcode mapping specified in <file>");
    System.out.println("  --output <file>   output to <file> instead of stdout");
    System.out.println("  --rawstring       copy string bytes directly to output");
    System.out.println("  --luaj            emulate Luaj's permissive parser");
    System.out.println("  --encoding <enc>  string encoding (default: GBK, e.g. UTF-8)");
    System.out.println();
    print_credits(System.out);
  }
  
  private static void print_unluac_string(PrintStream out) {
    out.println("unluac v" + version + " (PDE Edition)");
  }
  
  private static void print_credits(PrintStream out) {
    out.println("Credits:");
    out.println("  Derived from unluac, originally modified by AeonLucid");
    out.println("  https://github.com/AeonLucid");
    out.println("  Thanks to the AvatarStarCBT project");
  }
  
  private static void print_usage(PrintStream out) {
    out.println("  usage: java -jar unluac.jar [options] <file>");
  }
  
  private static LFunction file_to_function(String fn, Configuration config) throws IOException {
    RandomAccessFile file = null;
    try {
      file = new RandomAccessFile(fn, "r");
      long fileLength = file.length();
      
      // 自动检测文件头 - 检查前4字节是否为010A0000（大端序）
      boolean needSkipHeader = false;
      if(fileLength >= 8) {
        byte[] headerBytes = new byte[8];
        file.read(headerBytes);
        
        // 检查前4字节是否为010A0000（大端序）
        if(headerBytes[0] == 0x01 && headerBytes[1] == 0x0A &&
           headerBytes[2] == 0x00 && headerBytes[3] == 0x00) {
          // 匹配成功，需要跳过前8字节
          needSkipHeader = true;
          fileLength -= 8;
          System.out.println("Skip 8 bytes");
        } else {
          // 不匹配，重置文件指针到开始位置
          file.seek(0);
        }
      }
      
      ByteBuffer buffer = ByteBuffer.allocate((int) fileLength);
      buffer.order(ByteOrder.LITTLE_ENDIAN);
      int len = (int) fileLength;
      FileChannel in = file.getChannel();
      while(len > 0) len -= in.read(buffer);
      buffer.rewind();
      BHeader header = new BHeader(buffer, config);
      return header.main;
    } finally {
      if(file != null) {
        file.close();
      }
    }
  }
  
  public static void decompile(String in, String out, Configuration config) throws IOException {
    LFunction lmain = file_to_function(in, config);
    Decompiler d = new Decompiler(lmain);
    Decompiler.State result = d.decompile();
    Output output = new Output(new FileOutputProvider(new FileOutputStream(out)));
    d.print(result, output);
    output.finish();
  }
  
  public static void assemble(String in, String out) throws IOException, AssemblerException {
    OutputStream outstream = new BufferedOutputStream(new FileOutputStream(new File(out)));
    Assembler a = new Assembler(new Configuration(), FileUtils.createSmartTextFileReader(new File(in)), outstream);
    a.assemble();
    outstream.flush();
    outstream.close();
  }
  
  public static void disassemble(String in, String out) throws IOException {
    LFunction lmain = file_to_function(in, new Configuration());
    Disassembler d = new Disassembler(lmain);
    Output output = new Output(new FileOutputProvider(new FileOutputStream(out)));
    d.disassemble(output);
    output.finish();
  } 
}
