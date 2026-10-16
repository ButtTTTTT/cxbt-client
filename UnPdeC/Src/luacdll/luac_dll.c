/*
** luac_dll.c - Lua compiler DLL for Lua 5.2-alpha
** Exported functions for WPF/C# integration
** See Copyright Notice in lua.h
*/

#ifdef _WIN32
#include <windows.h>
#endif

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

#ifdef _WIN32
#define LUAC_API __declspec(dllexport)
#else
#define LUAC_API
#endif

/* Writer function for dumping to memory */
typedef struct {
    unsigned char* buffer;
    size_t size;
    size_t capacity;
} MemBuffer;

static int writer_memory(lua_State* L, const void* p, size_t size, void* u)
{
    MemBuffer* buf = (MemBuffer*)u;
    (void)L;
    
    if (buf->size + size > buf->capacity)
    {
        size_t new_capacity = buf->capacity == 0 ? 1024 : buf->capacity * 2;
        while (new_capacity < buf->size + size)
            new_capacity *= 2;
        
        unsigned char* new_buffer = (unsigned char*)realloc(buf->buffer, new_capacity);
        if (new_buffer == NULL)
            return 1;
        
        buf->buffer = new_buffer;
        buf->capacity = new_capacity;
    }
    
    memcpy(buf->buffer + buf->size, p, size);
    buf->size += size;
    return 0;
}

/* Writer function for dumping to file */
static int writer_file(lua_State* L, const void* p, size_t size, void* u)
{
    (void)L;
    return (fwrite(p, 1, size, (FILE*)u) != size) ? 1 : 0;
}

/*
** Compile Lua source file to bytecode file
** Parameters:
**   source_file: path to the .lua source file
**   output_file: path to the output .luac file
**   strip: 1 to strip debug info, 0 to keep it
**   error_msg: buffer to receive error message (can be NULL)
**   error_msg_size: size of error_msg buffer
** Returns: 0 on success, non-zero on error
*/
LUAC_API int luac_compile_file(
    const char* source_file,
    const char* output_file,
    int strip,
    char* error_msg,
    int error_msg_size
)
{
    lua_State* L;
    FILE* f;
    Proto* proto;
    int result = 0;
    
    if (error_msg && error_msg_size > 0)
        error_msg[0] = '\0';
    
    L = luaL_newstate();
    if (L == NULL)
    {
        if (error_msg)
            snprintf(error_msg, error_msg_size, "not enough memory");
        return -1;
    }
    
    /* open basic library */
    lua_pushcfunction(L, luaopen_base);
    lua_pushstring(L, "_G");
    lua_call(L, 1, 0);
    
    /* load and compile the file */
    if (luaL_loadfile(L, source_file) != LUA_OK)
    {
        if (error_msg)
            snprintf(error_msg, error_msg_size, "%s", lua_tostring(L, -1));
        lua_close(L);
        return -2;
    }
    
    /* get the Proto from the function */
    proto = getproto(L->top - 1);
    if (proto == NULL)
    {
        if (error_msg)
            snprintf(error_msg, error_msg_size, "internal error: not a Lua function");
        lua_close(L);
        return -3;
    }
    
    /* open output file */
    f = fopen(output_file, "wb");
    if (f == NULL)
    {
        if (error_msg)
            snprintf(error_msg, error_msg_size, "cannot open output file: %s", strerror(errno));
        lua_close(L);
        return -4;
    }
    
    /* dump bytecode */
    if (luaU_dump(L, proto, writer_file, f, strip) != 0)
    {
        if (error_msg)
            snprintf(error_msg, error_msg_size, "error writing output file");
        result = -5;
    }
    
    fclose(f);
    lua_close(L);
    return result;
}

/*
** Compile Lua source string to bytecode buffer
** Parameters:
**   source_code: Lua source code string
**   source_name: name for the source (for error messages)
**   strip: 1 to strip debug info, 0 to keep it
**   out_buffer: pointer to receive the bytecode buffer (caller must free with luac_free_buffer)
**   out_size: pointer to receive the bytecode size
**   error_msg: buffer to receive error message (can be NULL)
**   error_msg_size: size of error_msg buffer
** Returns: 0 on success, non-zero on error
*/
LUAC_API int luac_compile_string(
    const char* source_code,
    const char* source_name,
    int strip,
    unsigned char** out_buffer,
    size_t* out_size,
    char* error_msg,
    int error_msg_size
)
{
    lua_State* L;
    Proto* proto;
    MemBuffer buf = {NULL, 0, 0};
    int result = 0;
    
    if (out_buffer) *out_buffer = NULL;
    if (out_size) *out_size = 0;
    
    if (error_msg && error_msg_size > 0)
        error_msg[0] = '\0';
    
    L = luaL_newstate();
    if (L == NULL)
    {
        if (error_msg)
            snprintf(error_msg, error_msg_size, "not enough memory");
        return -1;
    }
    
    /* open basic library */
    lua_pushcfunction(L, luaopen_base);
    lua_pushstring(L, "_G");
    lua_call(L, 1, 0);
    
    /* load and compile the string */
    if (luaL_loadstring(L, source_code) != LUA_OK)
    {
        if (error_msg)
            snprintf(error_msg, error_msg_size, "%s", lua_tostring(L, -1));
        lua_close(L);
        return -2;
    }
    
    /* get the Proto from the function */
    proto = getproto(L->top - 1);
    if (proto == NULL)
    {
        if (error_msg)
            snprintf(error_msg, error_msg_size, "internal error: not a Lua function");
        lua_close(L);
        return -3;
    }
    
    /* set source name */
    if (source_name && proto->source == NULL)
    {
        char* name = (char*)malloc(strlen(source_name) + 2);
        name[0] = '@';
        strcpy(name + 1, source_name);
        proto->source = luaS_new(L, name);
        free(name);
    }
    
    /* dump bytecode to memory */
    if (luaU_dump(L, proto, writer_memory, &buf, strip) != 0)
    {
        if (error_msg)
            snprintf(error_msg, error_msg_size, "error generating bytecode");
        if (buf.buffer) free(buf.buffer);
        lua_close(L);
        return -5;
    }
    
    if (out_buffer && out_size)
    {
        *out_buffer = buf.buffer;
        *out_size = buf.size;
    }
    else if (buf.buffer)
    {
        free(buf.buffer);
    }
    
    lua_close(L);
    return result;
}

/*
** Free a buffer allocated by luac_compile_string
*/
LUAC_API void luac_free_buffer(unsigned char* buffer)
{
    if (buffer)
        free(buffer);
}

/*
** Get Lua version string
*/
LUAC_API const char* luac_version(void)
{
    return LUA_VERSION;
}

/*
** Add custom header to bytecode file
** Parameters:
**   input_file: original .luac file
**   output_file: output file with header
**   header_data: custom header bytes
**   header_size: size of header in bytes
**   error_msg: buffer for error message
**   error_msg_size: size of error buffer
** Returns: 0 on success, non-zero on error
*/
LUAC_API int luac_add_header(
    const char* input_file,
    const char* output_file,
    const unsigned char* header_data,
    int header_size,
    char* error_msg,
    int error_msg_size
)
{
    FILE* fin;
    FILE* fout;
    unsigned char buffer[4096];
    size_t bytes_read;
    
    if (error_msg && error_msg_size > 0)
        error_msg[0] = '\0';
    
    fin = fopen(input_file, "rb");
    if (fin == NULL)
    {
        if (error_msg)
            snprintf(error_msg, error_msg_size, "cannot open input file: %s", strerror(errno));
        return -1;
    }
    
    fout = fopen(output_file, "wb");
    if (fout == NULL)
    {
        if (error_msg)
            snprintf(error_msg, error_msg_size, "cannot open output file: %s", strerror(errno));
        fclose(fin);
        return -2;
    }
    
    /* write custom header */
    if (header_data && header_size > 0)
    {
        if (fwrite(header_data, 1, header_size, fout) != (size_t)header_size)
        {
            if (error_msg)
                snprintf(error_msg, error_msg_size, "error writing header");
            fclose(fin);
            fclose(fout);
            return -3;
        }
    }
    
    /* copy rest of file */
    while ((bytes_read = fread(buffer, 1, sizeof(buffer), fin)) > 0)
    {
        if (fwrite(buffer, 1, bytes_read, fout) != bytes_read)
        {
            if (error_msg)
                snprintf(error_msg, error_msg_size, "error writing output file");
            fclose(fin);
            fclose(fout);
            return -4;
        }
    }
    
    fclose(fin);
    fclose(fout);
    return 0;
}

/*
** Compile Lua source file to bytecode file with custom header
** This is a convenience function that combines compile and add_header
** Parameters:
**   source_file: path to the .lua source file
**   output_file: path to the output file
**   header_data: custom header bytes (can be NULL)
**   header_size: size of header in bytes
**   strip: 1 to strip debug info, 0 to keep it
**   error_msg: buffer to receive error message (can be NULL)
**   error_msg_size: size of error_msg buffer
** Returns: 0 on success, non-zero on error
*/
LUAC_API int luac_compile_with_header(
    const char* source_file,
    const char* output_file,
    const unsigned char* header_data,
    int header_size,
    int strip,
    char* error_msg,
    int error_msg_size
)
{
    char temp_path[MAX_PATH];
    int result;
    
    if (error_msg && error_msg_size > 0)
        error_msg[0] = '\0';
    
    /* create temp file path */
    GetTempPathA(MAX_PATH, temp_path);
    strcat(temp_path, "luac_temp_XXXXXX");
    
    /* generate unique temp filename */
    {
        char* p = temp_path + strlen(temp_path) - 6;
        static const char chars[] = "abcdefghijklmnopqrstuvwxyz0123456789";
        for (int i = 0; i < 6; i++)
            p[i] = chars[rand() % (sizeof(chars) - 1)];
    }
    
    /* compile to temp file */
    result = luac_compile_file(source_file, temp_path, strip, error_msg, error_msg_size);
    if (result != 0)
    {
        remove(temp_path);
        return result;
    }
    
    /* add header and write to output */
    result = luac_add_header(temp_path, output_file, header_data, header_size, error_msg, error_msg_size);
    
    /* cleanup temp file */
    remove(temp_path);
    
    return result;
}
