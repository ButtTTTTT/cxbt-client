/*
** luac.c - Lua compiler for Lua 5.2-alpha
** See Copyright Notice in lua.h
*/

#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define luac_c
#define LUA_CORE

#include "lua.h"
#include "lauxlib.h"
#include "lualib.h"
#include "ldo.h"
#include "lfunc.h"
#include "lmem.h"
#include "lobject.h"
#include "lopcodes.h"
#include "lstate.h"
#include "lstring.h"
#include "lundump.h"

#define PROGNAME	"luac"		/* default program name */
#define OUTPUT		PROGNAME ".out"	/* default output file name */

static int listing=0;			/* list bytecodes? */
static int dumping=1;			/* dump bytecodes? */
static int stripping=0;			/* strip debug information? */
static char Output[]={ OUTPUT };	/* default output file name */
static const char* output=Output;	/* actual output file name */
static const char* progname=PROGNAME;	/* actual program name */

static void fatal(const char* message)
{
 fprintf(stderr,"%s: %s\n",progname,message);
 exit(EXIT_FAILURE);
}

static void cannot(const char* what)
{
 fprintf(stderr,"%s: cannot %s %s: %s\n",progname,what,output,strerror(errno));
 exit(EXIT_FAILURE);
}

static void usage(const char* message)
{
 if (*message=='-')
  fprintf(stderr,"%s: unrecognized option '%s'\n",progname,message);
 else
  fprintf(stderr,"%s: %s\n",progname,message);
 fprintf(stderr,
  "usage: %s [options] [filenames]\n"
  "Available options are:\n"
  "  -l        list (use -l -l for full listing)\n"
  "  -o name   output to file 'name' (default is \"" OUTPUT "\")\n"
  "  -p        parse only\n"
  "  -s        strip debug information\n"
  "  -v        show version information\n"
  "  --        stop handling options\n"
  "  -         use stdin as input\n"
  ,progname);
 exit(EXIT_FAILURE);
}

#define IS(s)	(strcmp(argv[i],s)==0)

static int doargs(int argc, char* argv[])
{
 int i;
 int version=0;
 if (argv[0]!=NULL && *argv[0]!=0) progname=argv[0];
 for (i=1; i<argc; i++)
 {
  if (*argv[i]!='-')			/* end of options; keep it */
   break;
  else if (IS("--"))			/* end of options; skip it */
  {
   ++i;
   if (version) ++version;
   break;
  }
  else if (IS("-"))			/* end of options; use stdin */
   break;
  else if (IS("-l"))			/* list */
   ++listing;
  else if (IS("-o"))			/* output file */
  {
   output=argv[++i];
   if (output==NULL || *output==0 || (*output=='-' && output[1]!=0))
    usage("-o needs argument");
   if (IS("-")) output=NULL;
  }
  else if (IS("-p"))			/* parse only */
   dumping=0;
  else if (IS("-s"))			/* strip debug information */
   stripping=1;
  else if (IS("-v"))			/* show version */
   ++version;
  else					/* unknown option */
   usage(argv[i]);
 }
 if (i==argc && (listing || !dumping))
 {
  dumping=0;
  argv[--i]=Output;
 }
 if (version)
 {
  printf("%s\n",LUA_COPYRIGHT);
  if (version==argc-1) exit(EXIT_SUCCESS);
 }
 return i;
}

/* Writer function for dumping */
static int writer(lua_State* L, const void* p, size_t size, void* u)
{
 UNUSED(L);
 return (fwrite(p,1,size,(FILE*)u)!=size) ? 1 : 0;
}

static int pmain(lua_State *L)
{
 int argc = lua_tointeger(L, 1);
 char** argv = (char**)lua_touserdata(L, 2);
 const char* filename;
 int i;
 FILE* f;
 Proto* fmain;
 
 if (argv[0] && argv[0][0]) progname = argv[0];
 
 /* process options */
 i = doargs(argc, argv);
 if (i >= argc) return 0;
 
 /* open basic library manually (needed for compilation) */
 lua_pushcfunction(L, luaopen_base);
 lua_pushstring(L, "_G");
 lua_call(L, 1, 0);
 
 /* load and compile the file */
 filename = (strcmp(argv[i], "-") == 0) ? NULL : argv[i];
 
 if (luaL_loadfile(L, filename) != LUA_OK)
 {
  fprintf(stderr, "%s: %s\n", progname, lua_tostring(L, -1));
  return 0;
 }
 
 /* get the Proto from the function on top of stack */
 fmain = getproto(L->top - 1);
 if (fmain == NULL)
 {
  fprintf(stderr, "%s: internal error - not a Lua function\n", progname);
  return 0;
 }
 
 /* set source name if not set */
 if (fmain->source == NULL && filename != NULL)
 {
  /* create source string with @ prefix */
  char* source = (char*)malloc(strlen(filename) + 2);
  source[0] = '@';
  strcpy(source + 1, filename);
  fmain->source = luaS_new(L, source);
  free(source);
 }
 
 /* list bytecodes if requested */
 if (listing)
 {
  luaU_print(fmain, listing > 1);
 }
 
 /* dump bytecodes */
 if (dumping)
 {
  f = fopen(output, "wb");
  if (f == NULL)
   cannot("open output file");
  
  if (luaU_dump(L, fmain, writer, f, stripping) != 0)
   cannot("write output file");
  
  if (fclose(f) != 0)
   cannot("close output file");
 }
 
 return 0;
}

int main(int argc, char* argv[])
{
 lua_State* L;
 int status;
 
 L = luaL_newstate();
 if (L == NULL) fatal("not enough memory");
 
 lua_pushcfunction(L, pmain);
 lua_pushinteger(L, argc);
 lua_pushlightuserdata(L, argv);
 
 status = lua_pcall(L, 2, 0, 0);
 if (status != LUA_OK)
 {
  const char* msg = lua_tostring(L, -1);
  if (msg == NULL) msg = "(error with no message)";
  fprintf(stderr, "%s: %s\n", progname, msg);
  lua_close(L);
  return EXIT_FAILURE;
 }
 
 lua_close(L);
 return EXIT_SUCCESS;
}
