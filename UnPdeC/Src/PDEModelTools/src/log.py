# log.py
import logging


class PMTFormatter(logging.Formatter):
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
        module = getattr(record, "pmt_module", "")
        record.module_suffix = f".{module}" if module else ""
        return super().format(record)


def setup_logger() -> logging.Logger:
    """配置日志"""
    logger = logging.getLogger("PMT")
    logger.setLevel(logging.DEBUG)

    handler: logging.Handler | None = None
    for h in logger.handlers:
        if isinstance(h, logging.StreamHandler):
            handler = h
            break
    if handler is None:
        handler = logging.StreamHandler()
        logger.addHandler(handler)
    if not isinstance(handler.formatter, PMTFormatter):
        handler.setFormatter(PMTFormatter())
    return logger


def get_module_logger(module_name: str) -> logging.LoggerAdapter:
    base_logger = setup_logger()
    module = (module_name or "").strip().upper()
    return logging.LoggerAdapter(base_logger, {"pmt_module": module})


log: logging.Logger = setup_logger()
""" PMT 日志实例 """
