"""
Auth Service — Login, Registration, and Current-User endpoints.

POST /auth/login              — email + password → JWT bearer token
POST /auth/register/member    — create member account with password
POST /auth/register/recruiter — create recruiter account with password
GET  /auth/me                 — return current user info from token
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from database import get_db
from models.member import Member
from models.recruiter import Recruiter
from models.user_credentials import UserCredentials
from auth import (
    hash_password, verify_password, create_access_token,
    get_current_user, TokenPayload,
)
from schemas.auth import (
    LoginRequest, TokenResponse,
    RegisterMemberRequest, RegisterRecruiterRequest,
    MeResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["Auth"])


# ── Login ────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse, summary="Login — returns JWT bearer token")
async def login(req: LoginRequest, db: Session = Depends(get_db)):
    """
    Authenticate with email and password. Returns a JWT bearer token valid for
    24 hours. Pass the token as `Authorization: Bearer <token>` on protected
    endpoints.

    The same endpoint accepts form-data (username/password) for Swagger UI
    compatibility — use the `/auth/login-form` path with the Swagger Authorize
    button.
    """
    cred = db.query(UserCredentials).filter(UserCredentials.email == req.email).first()
    if not cred or not verify_password(req.password, cred.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = create_access_token(
        user_id=cred.user_id,
        user_type=cred.user_type,
        email=cred.email,
    )
    return TokenResponse(
        access_token=token,
        user_type=cred.user_type,
        user_id=cred.user_id,
        email=cred.email,
    )


@router.post(
    "/login-form",
    response_model=TokenResponse,
    summary="Login (form data) — for Swagger Authorize button",
    include_in_schema=True,
)
async def login_form(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """Identical to /auth/login but accepts application/x-www-form-urlencoded.
    Use this path in the Swagger UI Authorize dialog (username = email)."""
    cred = db.query(UserCredentials).filter(
        UserCredentials.email == form_data.username
    ).first()
    if not cred or not verify_password(form_data.password, cred.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = create_access_token(
        user_id=cred.user_id,
        user_type=cred.user_type,
        email=cred.email,
    )
    return TokenResponse(
        access_token=token,
        user_type=cred.user_type,
        user_id=cred.user_id,
        email=cred.email,
    )


# ── Registration ─────────────────────────────────────────────────────────────

@router.post(
    "/register/member",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new member account",
)
async def register_member(req: RegisterMemberRequest, db: Session = Depends(get_db)):
    """
    Create a new member profile and auth credentials in one step.
    Returns a JWT so the user is immediately logged in after registration.
    """
    # Block duplicate email across both tables
    if db.query(UserCredentials).filter(UserCredentials.email == req.email).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    if db.query(Member).filter(Member.email == req.email).first():
        raise HTTPException(status_code=409, detail="Email already exists as a member profile")

    member = Member(
        first_name=req.first_name,
        last_name=req.last_name,
        email=req.email,
        headline=req.headline,
        location_city=req.location_city,
        location_state=req.location_state,
    )
    db.add(member)
    db.flush()  # get member_id before commit

    cred = UserCredentials(
        user_type="member",
        user_id=member.member_id,
        email=req.email,
        password_hash=hash_password(req.password),
    )
    db.add(cred)
    db.commit()

    token = create_access_token(
        user_id=member.member_id,
        user_type="member",
        email=req.email,
    )
    logger.info(f"Registered member {member.member_id}: {req.email}")
    return TokenResponse(
        access_token=token,
        user_type="member",
        user_id=member.member_id,
        email=req.email,
    )


@router.post(
    "/register/recruiter",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new recruiter account",
)
async def register_recruiter(req: RegisterRecruiterRequest, db: Session = Depends(get_db)):
    """
    Create a new recruiter profile and auth credentials in one step.
    Returns a JWT so the recruiter is immediately logged in after registration.
    """
    if db.query(UserCredentials).filter(UserCredentials.email == req.email).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    if db.query(Recruiter).filter(Recruiter.email == req.email).first():
        raise HTTPException(status_code=409, detail="Email already exists as a recruiter profile")

    recruiter = Recruiter(
        first_name=req.first_name,
        last_name=req.last_name,
        email=req.email,
        company_name=req.company_name,
        company_industry=req.company_industry,
    )
    db.add(recruiter)
    db.flush()

    cred = UserCredentials(
        user_type="recruiter",
        user_id=recruiter.recruiter_id,
        email=req.email,
        password_hash=hash_password(req.password),
    )
    db.add(cred)
    db.commit()

    token = create_access_token(
        user_id=recruiter.recruiter_id,
        user_type="recruiter",
        email=req.email,
    )
    logger.info(f"Registered recruiter {recruiter.recruiter_id}: {req.email}")
    return TokenResponse(
        access_token=token,
        user_type="recruiter",
        user_id=recruiter.recruiter_id,
        email=req.email,
    )


# ── Current user ─────────────────────────────────────────────────────────────

@router.get("/me", response_model=MeResponse, summary="Return current user info")
async def me(
    current_user: TokenPayload = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the profile for the authenticated user."""
    if current_user.user_type == "member":
        profile = db.query(Member).filter(
            Member.member_id == current_user.user_id
        ).first()
        profile_dict = profile.to_dict() if profile else {}
    else:
        profile = db.query(Recruiter).filter(
            Recruiter.recruiter_id == current_user.user_id
        ).first()
        profile_dict = profile.to_dict() if profile else {}

    return MeResponse(
        user_type=current_user.user_type,
        user_id=current_user.user_id,
        email=current_user.email,
        profile=profile_dict,
    )
