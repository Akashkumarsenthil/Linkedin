# Jobs Feature Integration Documentation

## Overview
The static Jobs page has been fully integrated with the backend APIs. The application now supports real-time job searching, persistent job applications, and job saving functionality.

## Features Implemented

### 1. Real-time Search & Filtering
- **Feature**: Users can search for jobs by title or keyword.
- **Implementation**: The search bar in `JobsPage.tsx` fires a `POST /jobs/search` request. The backend utilizes MySQL FULLTEXT search to return relevant job postings.
- **Data Model**: The frontend now consumes the backend `JobPosting` schema instead of local static data.

### 2. Functional "Apply" Button
- **Feature**: Authenticated users can officially apply for jobs.
- **Implementation**: Clicking "Apply" in `JobDetails.tsx` sends a `POST /applications/submit` request to the backend. The backend atomically updates the `applicants_count` and safely persists the event in the database and Kafka.
- **UI State**: A toast notification appears on success, and the button permanently changes to a green "Applied" state.

### 3. Application History Tracking
- **Feature**: The UI remembers which jobs the user has applied to, even after refreshing the page.
- **Implementation**: On load, `JobsPage.tsx` queries the `POST /applications/byMember` endpoint to fetch the user's past application history. It matches the job IDs against the displayed jobs to natively grey out the "Apply" buttons for previously submitted applications.

### 4. Job Saving (Bookmarking)
- **Feature**: Users can save jobs for later review.
- **Implementation**: Clicking "Save" calls the `POST /jobs/save` backend API to persist the saved state to the database.

## Technical Notes
- **Authentication**: The frontend utilizes the existing `parseStoredUser()` utility to extract the `member_id` from the local JWT token, ensuring that API requests are properly attributed to the logged-in user.
- **Company Information**: Currently, the backend `JobPosting` model returns a `company_id`. To provide a seamless UI without modifying the backend schemas, the frontend procedurally generates placeholder company names (e.g., `Company #1`) and logos based on this ID.
- **Static Data Removed**: The legacy `jobsData.ts` file has been fully deprecated and disconnected from the application flow.
