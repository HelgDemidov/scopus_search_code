"""merge_doi_index_and_main_head

Revision ID: d2c4aaedfd4e
Revises: c8f5490cc436, 0004_doi_partial_index
Create Date: 2026-04-18 21:56:28.638678

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd2c4aaedfd4e'
down_revision: Union[str, Sequence[str], None] = ('c8f5490cc436', '0004_doi_partial_index')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
