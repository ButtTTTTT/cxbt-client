# log.py
import os
import logging


class PDEStudioFormatter(logging.Formatter):
    def __init__(self):
        super().__init__("%(name)s.%(levelname_short)s%(module_suffix)s: %(message)s")

    def format(self, record):
        record.levelname_short = {
            "DEBUG": "D",
            "INFO": "I",
            "WARNING": "W",
            "ERROR": "E",
            "CRITICAL": "C",
        }.get(record.levelname, record.levelname)
        module = getattr(record, "pde_module", "")
        record.module_suffix = f".{module}" if module else ""
        return super().format(record)


def _get_log_filepath() -> str:
    """获取日志文件路径（与插件 __init__.py 同目录）"""
    # __file__ = .../src/log.py → 日志放在 .../blender_pdestudio.log
    addon_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(addon_dir, "blender_pdestudio.log")


def setup_logger() -> logging.Logger:
    """配置日志（同时输出到 stdout 和文件）"""
    logger = logging.getLogger("PDEStudio")
    logger.setLevel(logging.DEBUG)

    formatter = PDEStudioFormatter()

    # --- StreamHandler (stdout) ---
    stream_handler: logging.Handler | None = None
    for h in logger.handlers:
        if isinstance(h, logging.StreamHandler) and not isinstance(h, logging.FileHandler):
            stream_handler = h
            break
    if stream_handler is None:
        stream_handler = logging.StreamHandler()
        logger.addHandler(stream_handler)
    stream_handler.setFormatter(formatter)

    # --- FileHandler ---
    log_path = _get_log_filepath()
    file_handler: logging.Handler | None = None
    for h in logger.handlers:
        if isinstance(h, logging.FileHandler):
            file_handler = h
            break
    if file_handler is None:
        try:
            file_handler = logging.FileHandler(log_path, mode="w", encoding="utf-8")
            file_handler.setFormatter(formatter)
            logger.addHandler(file_handler)
        except Exception:
            pass  # 文件不可写时静默降级

    return logger


def get_module_logger(module_name: str) -> logging.LoggerAdapter:
    base_logger = setup_logger()
    module = (module_name or "").strip().upper()
    return logging.LoggerAdapter(base_logger, {"pde_module": module})


log: logging.Logger = setup_logger()
""" PDE Studio 日志实例 """
