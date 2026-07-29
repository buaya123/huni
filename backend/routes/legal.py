from fastapi import APIRouter, HTTPException

from models.legal import LegalSummary, LegalDocument
from services.legal_service import LegalService

router = APIRouter(
    prefix="/legal",
    tags=["Legal"],
)


@router.get(
    "",
    response_model=list[LegalSummary],
)
def list_documents():

    return LegalService.list_documents()


@router.get(
    "/{document}",
    response_model=LegalDocument,
)
def get_document(document: str):

    doc = LegalService.get_document(document)

    if doc is None:
        raise HTTPException(
            status_code=404,
            detail="Legal document not found",
        )

    return doc