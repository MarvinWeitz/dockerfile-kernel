from docker_kernel.magic import Magic
from typing import Callable


class Install(Magic):
    """Install additional packages to the docker image."""
    def __init__(self, kernle, *args, **flags):
        super().__init__(kernle, *args, **flags)

    @staticmethod
    @property
    def REQUIRED_ARGS() -> tuple[list[str], int]:
        return (["package-manager", "package"], 2)
        
    @staticmethod
    @property
    def ARGS_RULES() -> dict[int, tuple[Callable[[str], bool], str]]:
        return {}
    
    @staticmethod
    @property
    def VALID_FLAGS():
        return []

    @staticmethod
    @property
    def VALID_SHORTS():
        return []
    
    def _execute_magic(self) -> list[str] | str:
        match self._args[0].lower():
            case "apt-get":
                package = " ".join(self._args[1:])
                code = f"RUN apt-get update && apt-get install -y {package} && rm -rf /var/lib/apt/lists/*"
            case other:
                return "Package manager not available (currently available: apt-get)"
        self._kernel.set_payload("set_next_input", code, True)
        code = self._kernel.create_build_stage(code)
        return self._kernel.build_image(code)
