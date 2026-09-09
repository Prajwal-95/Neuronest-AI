from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
def health():
    return {"status": "ok", "service": "neurONest-ai", "version": "1.0.0"}
