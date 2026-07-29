from pydantic import BaseModel


class LegalSummary(BaseModel):
    id: str
    title: str
    version: str


class LegalDocument(BaseModel):
    id: str
    title: str
    version: str
    effective: str
    last_updated: str
    content: str