# LinkedIn Clone — Complete UI Revamp & Development Blueprint

**Project:** `github.com/Akashkumarsenthil/Linkedin`
**Goal:** Transform the existing LinkedIn clone into a pixel-perfect, fully functional replica with professional-grade UI for both Member and Recruiter personas.
**Audience:** AI agents (Cursor, Copilot, Windsurf) and developers building this project.

---

## Table of Contents

1. [Design System & Brand Tokens](#1-design-system--brand-tokens)
2. [Global Shell & Navigation](#2-global-shell--navigation)
3. [Member Pages (16 Pages)](#3-member-pages)
4. [Recruiter Pages (8 Pages)](#4-recruiter-pages)
5. [Shared Components Library](#5-shared-components-library)
6. [Data Models & State Management](#6-data-models--state-management)
7. [Backend Changes Required](#7-backend-changes-required)
8. [Icon & Asset Strategy](#8-icon--asset-strategy)
9. [Page-by-Page Prompts for AI Agents](#9-page-by-page-prompts-for-ai-agents)

---

## 1. Design System & Brand Tokens

Every component must reference these tokens. No hardcoded colors anywhere.

### Color Palette (Exact LinkedIn Colors)

| Token Name | Hex | Usage |
|---|---|---|
| `--li-blue-primary` | `#0A66C2` | Primary buttons, links, active nav icons |
| `--li-blue-hover` | `#004182` | Button hover states |
| `--li-blue-light` | `#70B5F9` | Notification badges, link hover backgrounds |
| `--li-green` | `#057642` | "Open to Work", online indicators, success states |
| `--li-red` | `#CC1016` | Error states, notification dots |
| `--li-orange` | `#E68523` | Warning states |
| `--li-purple` | `#8D6CAB` | Premium badge |
| `--li-bg-light` | `#F4F2EE` | Page background (warm off-white) |
| `--li-bg-white` | `#FFFFFF` | Card backgrounds |
| `--li-text-primary` | `#000000E6` | Headings, names (rgba 0,0,0,0.9) |
| `--li-text-secondary` | `#00000099` | Subtitles, timestamps (rgba 0,0,0,0.6) |
| `--li-text-tertiary` | `#00000066` | Placeholder text (rgba 0,0,0,0.4) |
| `--li-border` | `#00000026` | Card borders, dividers |
| `--li-card-shadow` | `0 0 0 1px rgba(0,0,0,0.08), 0 4px 6px rgba(0,0,0,0.04)` | Card elevation |

### Typography

| Style | Font | Size | Weight | Line Height |
|---|---|---|---|---|
| Nav Logo | system-ui | 28px | 700 | 1.2 |
| Card Heading | system-ui | 20px | 600 | 1.3 |
| User Name (Feed) | system-ui | 14px | 600 | 1.4 |
| User Headline | system-ui | 12px | 400 | 1.4 |
| Body Text | system-ui | 14px | 400 | 1.5 |
| Button Text | system-ui | 16px | 600 | 1.25 |
| Small/Meta | system-ui | 12px | 400 | 1.33 |
| Timestamp | system-ui | 12px | 400 | 1.33 |

LinkedIn uses `-apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto` as its font stack.

### Spacing Scale

Use an 8px base grid: 4px, 8px, 12px, 16px, 24px, 32px, 48px.

### Border Radius

Cards: `8px`. Buttons: `16px` (pill) or `4px` (square). Avatars: `50%`. Input fields: `4px`.

### Button Styles

| Type | Background | Text Color | Border | Padding |
|---|---|---|---|---|
| Primary | `#0A66C2` | `#FFFFFF` | none | `6px 16px` |
| Primary Hover | `#004182` | `#FFFFFF` | none | — |
| Secondary (Outline) | transparent | `#0A66C2` | `1px solid #0A66C2` | `6px 16px` |
| Ghost | transparent | `#00000099` | none | `6px 8px` |
| Danger | `#CC1016` | `#FFFFFF` | none | `6px 16px` |

---

## 2. Global Shell & Navigation

### Top Navigation Bar (Fixed, 52px height)

The nav bar is white (`#FFFFFF`) with a subtle bottom border (`1px solid rgba(0,0,0,0.08)`). Content is centered in a `1128px` max-width container.

**Left section:** LinkedIn logo (square `in` icon in blue `#0A66C2`), Search bar (gray `#EDF3F8` rounded pill, magnifying glass icon, placeholder "Search").

**Center section — Icon-based nav items (each 60px wide, icon + label stacked):**

| Nav Item | Icon (Flaticon/Lucide equivalent) | Active State |
|---|---|---|
| Home | `house` (solid fill when active) | Bottom border `2px solid #000`, icon turns black |
| My Network | `people` / `users` | Same active pattern |
| Jobs | `briefcase` | Same |
| Messaging | `chat-bubble` / `message-square` | Same + unread count badge |
| Notifications | `bell` | Same + red dot or count |

**Right section:** Profile avatar (24px circle) with "Me ▾" dropdown, "For Business" grid icon with dropdown, "Try Premium" gold text link.

**Inactive icons:** `#00000099` (60% black). **Active icons:** `#000000` with `2px` solid bottom border.

### Left Sidebar (Profile Mini-Card) — Appears on Home Feed

A card with the user's banner image (blurred or gradient fallback), circular avatar overlapping the banner, name, headline, "Who's viewed your profile" count, "Impressions of your post" count. Each stat is a clickable link with hover highlight. Bottom section has "Saved items" and "Groups" links.

### Right Sidebar — Appears on Home Feed

"LinkedIn News" card with trending topics (bullet list with article title + "Xh ago" timestamp). Below that, a "People you may know" card showing 2-3 profile suggestions with avatar, name, headline, mutual connections count, and a "Connect" button. Footer links at the very bottom (About, Accessibility, Help Center, etc.) in 12px gray text.

---

## 3. Member Pages

### PAGE 1: Home Feed (`/feed`)

**Layout:** 3-column grid — Left sidebar (225px), Main feed (540px), Right sidebar (300px). All inside a `1128px` container. Background is `#F4F2EE`.

**Create Post Box (Top of main feed):**
- White card with user's avatar (48px circle) + "Start a post" input (rounded pill, `#EDF3F8` bg)
- Below the input, 4 action buttons in a row:
  - 📷 Media (blue image icon + "Media" text)
  - 📅 Event (orange calendar icon + "Event" text)
  - 📝 Write article (red notepad icon + "Write article" text)

**Feed Post Card Structure:**
- **Header:** 48px avatar, Name (bold, 14px), Headline (12px gray), Timestamp + globe icon ("3h • 🌐"), Three-dot menu (⋯) top-right
- **Body:** Text content with "...see more" truncation at 3 lines. Support for images (single, 2-grid, 3-grid, 4-grid layouts), video thumbnails, documents/carousels, link previews (image + title + domain), polls
- **Engagement Bar:** "X likes · Y comments · Z reposts" in 12px gray
- **Action Bar:** 4 equal-width buttons with icons: 👍 Like, 💬 Comment, 🔁 Repost, ✈️ Send. Each has an icon + label, gray by default, blue when active. Like button has a long-press reaction picker (Like, Celebrate, Support, Love, Insightful, Funny) — each reaction is a small circular emoji
- **Comments Section (expandable):**
  - Comment input with user avatar + pill input
  - Each comment: avatar, name, headline, timestamp, comment text, Like + Reply links
  - Nested replies indented 40px
  - "Load more comments" link

**Feed Algorithm Sort Dropdown:** "Sort by: Top ▾" vs "Recent" at top of feed.

**Prompt for AI Agent:**
> "Build a LinkedIn-style home feed page. Three-column layout: left sidebar with profile mini-card (banner, avatar, name, headline, stats), center feed with create-post box and scrollable post cards, right sidebar with news and suggestions. Each post card must support: text with see-more, image grids (1/2/3/4), video embeds, document carousels, link previews, polls, reaction bar with 6 LinkedIn reactions (Like/Celebrate/Support/Love/Insightful/Funny), comment threads with nested replies. Use `#F4F2EE` background, white cards with `8px` border-radius, `1px solid rgba(0,0,0,0.08)` borders. Font stack: system-ui. Primary blue: `#0A66C2`. All post interactions (like, comment, repost, send) must be functional and persist to backend."

---

### PAGE 2: Profile Page (`/in/:username`)

**This is the most critical page. It must look 1:1 like real LinkedIn.**

**Banner Image:** Full-width within card, ~200px height, with a camera icon overlay for editing. Default: abstract blue gradient.

**Profile Header Section:**
- Avatar: 152px circle, positioned to overlap the banner by ~50%, white 4px border. Camera icon for edit.
- Name (24px, bold) + Pronouns badge + Verification checkmark
- Headline (16px, `#000000CC`)
- Location + "Contact info" link (blue, underlined)
- "500+ connections" link
- Mutual connections row: 3 overlapping tiny avatars + "X mutual connections"
- Action buttons row: "Open to" (outlined), "Add profile section" (outlined), "Enhance profile" (outlined), "Resources" (outlined), "More ⋯" (ghost)
- "Open to Work" banner (green bg with `#057642` text, dashed border)

**About Section Card:**
- Heading "About"
- Bio text with "...see more" expansion
- Edit pencil icon (top-right, only for own profile)

**Activity Section Card:**
- "X followers" link
- Tabs: Posts | Comments | Images
- Show 2-3 recent activity items
- "Show all activity →" link

**Experience Section Card:**
- Heading "Experience"
- Each entry: Company logo (48x48 square, rounded corners), Role title (bold), Company name (link), Date range + duration, Location, Description with bullet points
- Multiple roles at the same company: nested under the company with a connecting vertical line

**Education Section Card:**
- Heading "Education"
- Each entry: School logo, School name, Degree + Field, Date range, Activities, Grade

**Licenses & Certifications Card:**
- Credential name, Issuing org + logo, Issued date, Credential ID, "Show credential" external link button

**Skills Section Card:**
- Top 3 skills shown with endorsement counts
- Each skill: skill name, "X endorsements" with tiny overlapping avatars
- "Show all X skills →" link

**Recommendations Section Card:**
- Tabs: Received | Given
- Each: recommender avatar, name, relationship context, recommendation text

**Interests Section Card:**
- Tabs: Companies | Groups | Schools | Top Voices
- Grid of followed entity logos/avatars with names

**Prompt for AI Agent:**
> "Build a pixel-perfect LinkedIn profile page. Banner image (200px, full-width within card, editable). Profile photo (152px circle, white border, overlapping banner). Name, pronouns, verification badge, headline, location, contact info link, connection count with mutual connections (overlapping avatars). Action button row: 'Open to' / 'Add profile section' / 'Enhance profile' / 'More'. Open to Work green banner. Sections as separate white cards with 8px radius: About (expandable text), Activity (tabs: Posts/Comments/Images), Experience (company logos, nested roles with vertical connector line), Education (school logos), Licenses & Certifications (with 'Show credential' link), Skills (endorsement counts + avatars), Recommendations (Received/Given tabs), Interests (Companies/Groups/Schools tabs as logo grids). Right sidebar: 'People also viewed' cards and 'People you may know' cards with Connect buttons. All sections have pencil edit icons for own profile."

---

### PAGE 3: My Network (`/mynetwork`)

**Layout:** 2-column. Main content + right sidebar.

**Top Section:** "Manage my network" links — Connections, Contacts, Following, Groups, Events, Pages, Newsletters, Hashtags. Each with an icon and count.

**Invitation Management Card:**
- "Invitations (X)" heading
- Each invitation: avatar, name, headline, mutual connections, "Accept" (primary blue) + "Ignore" (ghost) buttons
- "See all X" link

**"People you may know" Grid:**
- Cards in a 3-column grid layout
- Each card: background image or gradient, avatar, name, headline, mutual connections, "Connect" button (outline style with person+ icon)
- Infinite scroll or "Show more" pagination

**Prompt for AI Agent:**
> "Build LinkedIn's My Network page. Top card: 'Manage my network' list with icons for Connections, Contacts, Following, Groups, Events, Pages, Newsletters, Hashtags — each showing a count. Invitation card below with accept/ignore for each pending invite (avatar, name, headline, mutual connections). Below that, a 'People you may know' grid — 3 cards per row, each with banner gradient, avatar, name, headline, mutual connections count, and outline 'Connect' button with person-plus icon. Support infinite scroll. All connect/accept/ignore actions must call backend APIs."

---

### PAGE 4: Jobs Hub (`/jobs`)

**Layout:** 2-column. Main content (left, wider) + right sidebar.

**Top Search Bar Card:**
- Two input fields side by side: "Search by title, skill, or company" + "City, state, or zip code"
- Blue "Search" button

**Suggested Jobs Card:**
- "Recommended for you" with small filter chips
- Each job listing: company logo (48px), job title (bold link), company name (link), location, "Easy Apply" green badge or "Applied" gray badge, posted time ("2d ago"), "Save" bookmark icon
- "Show all →" link

**Left Sidebar Links:**
- "My Jobs" (bookmark icon)
- "Preferences" (sliders icon)
- "Skill Assessments" (badge icon)
- "Interview Prep" (video icon)
- "Resume Builder" (document icon)
- "Job Application Settings" (gear icon)

**Job Detail View (Click-through or Split View):**
- Full job posting: company banner, logo, title, company name, location, posted date, applicant count, "Easy Apply" or "Apply on company site" button, "Save" button
- Tabs below: About the job (description, requirements, responsibilities as formatted HTML), About the company (mini company card)
- "People at [Company]" section with avatars
- Similar jobs section

**Prompt for AI Agent:**
> "Build LinkedIn's Jobs page. Top: search card with job title + location inputs and blue Search button. Left sidebar: My Jobs, Preferences, Skill Assessments, Interview Prep, Resume Builder links with icons. Main area: 'Recommended for you' job listings — each with company logo (48px square), job title (bold blue link), company name, location, 'Easy Apply' green badge, posted time, save/bookmark icon. Clicking a job opens a split-panel or full-page detail view with company banner, full description, requirements, apply button, company info card, and similar jobs. All job saves, applications, and searches must persist to backend."

---

### PAGE 5: Messaging (`/messaging`)

**Layout:** Full-width 2-panel split. Left panel (360px): conversation list. Right panel: active conversation.

**Left Panel — Conversation List:**
- Search bar at top ("Search messages")
- Filter pills: Focused | Other | InMail
- Each conversation row: avatar (48px), name (bold), last message preview (truncated, gray), timestamp, unread indicator (blue dot), online green dot on avatar
- Active conversation has `#EDF3F8` highlight background

**Right Panel — Active Conversation:**
- Header: avatar, name, headline, online status, "⋯" more menu (mute, delete, archive, report)
- Message area: scrollable, messages in chat bubbles. Sent messages right-aligned with `#D0E8FF` background, received messages left-aligned with `#F2F2F2` background. Timestamps between message groups. Read receipts (small avatar at bottom-right of last read message)
- Input area: rich text toolbar (bold, italic, list, emoji, GIF, attachment, image), text input, Send button (paper plane icon, blue when text is present)
- Typing indicator: "Name is typing..." with animated dots

**Prompt for AI Agent:**
> "Build LinkedIn's messaging interface. Two-panel layout: left panel (360px) with search bar, filter tabs (Focused/Other/InMail), conversation list — each row has avatar, name, message preview, timestamp, unread dot, online indicator. Right panel: conversation header (avatar, name, headline, more menu), scrollable message area with chat bubbles (sent: `#D0E8FF` right-aligned, received: `#F2F2F2` left-aligned), grouped timestamps, read receipts. Rich input bar: bold/italic/emoji/GIF/attachment buttons, send button. Support real-time messaging with typing indicators. WebSocket or polling required for live updates."

---

### PAGE 6: Notifications (`/notifications`)

**Layout:** 2-column. Main notifications list + right sidebar.

**Filter Tabs:** All | My Posts

**Notification Item Structure:**
- Avatar/icon (48px), notification text with bold names and action descriptions, timestamp, "⋯" more menu
- Types: connection requests, post likes, comments, shares, profile views, job alerts, endorsements, work anniversaries, birthdays, mentions
- Unread notifications have `#EDF3F8` left-blue-border or light blue background
- Batch grouping: "X people liked your post" with stacked avatars

**Prompt for AI Agent:**
> "Build LinkedIn's notifications page. List of notification items, each with: relevant avatar or icon, notification text (bold names + action description), timestamp, three-dot menu. Filter tabs: All and My Posts. Support notification types: likes, comments, shares, connection requests, profile views, job alerts, endorsements, birthdays, mentions. Unread items get a light blue `#EDF3F8` background with blue left border. Group similar notifications ('5 people liked your post') with stacked avatars. Mark-as-read on view. Clicking a notification navigates to the relevant content."

---

### PAGE 7: Search Results (`/search/results/:category`)

**Layout:** Left sidebar (filters) + main results.

**Search Categories Tabs:** All | People | Posts | Jobs | Companies | Groups | Schools | Events | Courses

**People Results:**
- Each: avatar, name, headline, location, mutual connections, "Connect" / "Follow" / "Message" button

**Posts Results:**
- Full post card (same as feed) but with highlighted search terms

**Jobs Results:**
- Same as jobs list but with highlighted terms

**Filter Sidebar (changes per category):**
- People: Connections (1st/2nd/3rd), Locations, Current company, Industry, School, Profile language
- Jobs: Date posted, Experience level, Company, Remote/On-site, Salary
- Posts: Date posted, Author, Sort by

**Prompt for AI Agent:**
> "Build LinkedIn's search results page. Top: search query bar. Category tabs below: All/People/Posts/Jobs/Companies/Groups/Schools/Events/Courses. Left sidebar: dynamic filters that change per category — People filters (connection degree, location, company, industry), Jobs filters (date, experience, remote), Posts filters (date, author). Results area renders appropriate card type per category. People: avatar+name+headline+connect button. Posts: full post card with search term highlighting. Jobs: job listing cards. Paginated results with counts."

---

### PAGE 8: Company Page (`/company/:slug`)

**Banner + Logo Header (like Profile page but for companies):**
- Banner image, square company logo (128px) with rounded corners, company name (24px bold), industry + tagline, follower count + employee count
- Action buttons: "+ Follow" (primary), "Visit website" (outlined)

**Tabs:** Home | About | Posts | Jobs | People | Events | Videos

**Home Tab:**
- Company overview card
- Recent posts feed

**About Tab:**
- Overview text, website, industry, company size, headquarters, type, founded, specialties

**Jobs Tab:**
- Active job listings with apply buttons

**People Tab:**
- "X employees on LinkedIn" with search, grid of employee cards

**Prompt for AI Agent:**
> "Build LinkedIn's company page. Banner (full-width) + square logo (128px, rounded corners) overlapping. Company name, industry, tagline, follower and employee counts. Action buttons: Follow (primary blue) and Visit website (outlined). Tab navigation: Home/About/Posts/Jobs/People/Events/Videos. About tab: overview, website, industry, size, HQ, founded, specialties in a structured card. Jobs tab: list of open positions with 'Easy Apply' badges. People tab: searchable grid of employees. Posts tab: company's post feed. All Follow actions and job interactions must persist."

---

### PAGE 9: Post Detail / Article Page (`/feed/update/:id` or `/pulse/:slug`)

**Post Detail View:**
- Full post card (same as feed) but without truncation
- Full comment section expanded with all comments visible
- Engagement count breakdown (who liked, reaction types)

**Article View:**
- Cover image (full-width)
- Author card (avatar, name, headline, follow button, published date)
- Article body (rich HTML: headings, paragraphs, images, quotes, lists, code blocks)
- Engagement bar + comments section

**Prompt for AI Agent:**
> "Build LinkedIn's post detail page and article page. Post detail: full post card without text truncation, expanded comment section with all comments/replies, engagement count with reaction breakdown. Article page: cover image, author header card (avatar, name, headline, follow button, date), rich HTML body supporting headings, paragraphs, images, blockquotes, lists. Engagement bar and full comment thread below. Related articles section at bottom."

---

### PAGE 10: Settings & Privacy (`/settings`)

**Layout:** Left sidebar nav + main content area.

**Sidebar Sections:**
- Account preferences (name, email, phone, language)
- Sign in & security (password, 2FA, sessions)
- Visibility (profile viewing, profile discovery, connections, story settings)
- Communications (email frequency, invitations, messages)
- Data privacy (data export, search history, ad preferences)
- Advertising data

**Each Section:** Form-based with toggle switches, radio buttons, dropdown selects, and text inputs. Clean white cards with descriptive labels.

**Prompt for AI Agent:**
> "Build LinkedIn's settings page. Left sidebar with section navigation: Account Preferences, Sign in & Security, Visibility, Communications, Data Privacy, Advertising Data. Main content area shows forms for the selected section. Use clean white cards with clear labels, toggle switches for boolean settings, dropdowns for selections, text inputs for editable fields. Each setting should have a description subtitle explaining what it controls. All changes save via API calls with success/error toast notifications."

---

### PAGE 11: Groups (`/groups/:id`)

**Group Header:** Cover image, group name (bold), group type (Public/Private), member count, "Join" or "Joined" button, admin names.

**Tabs:** Posts | About | People | Events

**Posts Tab:** Same feed card structure but within group context. Create post box at top.

**About Tab:** Group description, rules, admins.

**People Tab:** Searchable member list with role badges (Admin, Moderator, Member).

**Prompt for AI Agent:**
> "Build LinkedIn's group page. Header: cover image, group name, type badge (Public/Private), member count, Join/Joined button. Tabs: Posts/About/People/Events. Posts tab: group-specific feed with create-post box. About tab: description, rules, admin list. People tab: searchable member list with role badges (Admin/Moderator/Member). Events tab: upcoming group events. All post/join interactions persist to backend."

---

### PAGE 12: Events (`/events/:id`)

**Event Header Card:** Cover image, event name (bold, large), hosted by (avatar + name), date/time, event type (Online/In-person), location or link, attendee count with overlapping avatars, "Attend" button (primary) or "Attending ✓".

**Tabs:** About | Speakers | Attendees

**About:** Description, schedule, organizer details.

**Prompt for AI Agent:**
> "Build LinkedIn's event page. Header card: cover image, event title, host info, date/time, type (Online/In-person), location, attendee count with overlapping avatars. 'Attend' primary button that toggles to 'Attending ✓'. Tabs: About (description, schedule), Speakers (speaker cards), Attendees (avatar grid with names). Feed section for event-related posts."

---

### PAGE 13: Learning (`/learning`)

**Hero Section:** Featured course banner with CTA.

**Course Cards Grid:**
- Each: course thumbnail (16:9), title, instructor, duration, skill tags, "Save" bookmark
- Progress bar for in-progress courses

**Sections:** "Continue Learning", "Recommended for You", "Trending Courses", "Based on your profile"

**Prompt for AI Agent:**
> "Build LinkedIn Learning page. Hero: featured course banner with CTA button. Sections: Continue Learning (with progress bars), Recommended for You, Trending Courses — each as horizontal scrollable card rows. Course card: thumbnail (16:9), title, instructor name, duration, skill tags, save bookmark icon. Course detail page: video player, course description, chapters list with completion checkmarks, related courses."

---

### PAGE 14: Create Post Modal (Overlay)

**Triggered from:** "Start a post" button anywhere.

**Modal Structure:**
- Dark overlay background
- White modal (552px width, centered)
- Header: user avatar + name + "Post to: Anyone ▾" dropdown, close X
- Body: rich text editor area (auto-grow textarea). Mention support with `@` autocomplete. Hashtag support with `#` autocomplete.
- Media attachments area: image grid preview, document preview, video thumbnail
- Footer toolbar: 📷 Image, 🎥 Video, 📄 Document, 💼 Job, 🎉 Celebrate, 📊 Poll, ⋯ More
- "Post" button (primary blue, disabled when empty)

**Prompt for AI Agent:**
> "Build LinkedIn's create-post modal. Centered 552px modal over dark overlay. Header: user avatar, name, audience selector dropdown ('Anyone'/'Connections only'). Auto-growing rich text area with @ mention autocomplete and # hashtag support. Media attachment toolbar: Image, Video, Document, Job, Celebrate, Poll, More. Image uploads show grid preview. 'Post' button (primary blue, disabled when empty). Audience options: Anyone, Connections only, Group only. All uploads go to backend storage. Post creation calls API and prepends to feed."

---

### PAGE 15: Who Viewed Your Profile (`/me/profile-views`)

**Layout:** List of profile viewers.

**Each Viewer Row:** Avatar, name, headline, how they found you ("via LinkedIn search", "via your post"), timestamp. Some viewers shown as anonymous ("LinkedIn Member" with generic avatar).

**Analytics Card at Top:** Graph showing profile views over the past 90 days (line chart), "Search appearances this week" count, "Views by company/job title/location" breakdown.

**Prompt for AI Agent:**
> "Build LinkedIn's 'Who Viewed Your Profile' page. Top: analytics card with line chart (profile views over 90 days), search appearances count, breakdown by company/job title/location. Below: scrollable list of viewers — each with avatar, name, headline, discovery source ('via search', 'via your post'), timestamp. Anonymous viewers shown as 'LinkedIn Member' with generic silhouette avatar. Premium upsell banner for full viewer list access."

---

### PAGE 16: Creator / Newsletter Dashboard (`/my-items/posted-content`)

**Tabs:** Posts | Documents | Articles | Newsletters | Videos

**Analytics Per Post:** Impressions, unique viewers, reactions breakdown, comments count, reposts, click-through rate. Each post row has a mini bar chart.

**Prompt for AI Agent:**
> "Build LinkedIn's creator dashboard. Tab navigation: Posts/Documents/Articles/Newsletters/Videos. Each tab shows content list with analytics: impressions, unique viewers, reactions breakdown, comments, reposts, CTR. Each row has a mini sparkline or bar chart. Top-level summary cards: total impressions, total followers, follower growth chart. Sort options: by date, by impressions, by engagement."

---

## 4. Recruiter Pages

### RECRUITER PAGE 1: Recruiter Home Dashboard (`/recruiter/dashboard`)

**Layout:** Full-width dashboard with summary cards + recent activity.

**Summary Cards Row:**
- Active Job Posts (count + trend arrow)
- Total Applicants (count + trend)
- Pipeline Candidates (count by stage)
- InMails Sent / Response Rate (percentage)
- Interviews Scheduled (count)

**Recent Activity Feed:** Recent applicants, status changes, InMail replies.

**Quick Actions:** "Post a Job", "Search Candidates", "Review Applicants".

**Prompt for AI Agent:**
> "Build LinkedIn Recruiter dashboard. Top row: 5 summary metric cards — Active Jobs, Total Applicants, Pipeline Candidates, InMail Response Rate, Interviews Scheduled. Each card shows a count, trend arrow (up/down), and mini sparkline. Below: recent activity feed (new applicants, status changes, InMail replies) with timestamps. Quick action buttons: 'Post a Job' (primary), 'Search Candidates' (outlined), 'Review Applicants' (outlined). Charts: applicant flow funnel, source breakdown pie chart."

---

### RECRUITER PAGE 2: Job Posting Creation (`/recruiter/jobs/new`)

**Multi-Step Form:**

Step 1 — Job Details: Title, company (pre-filled), workplace type (On-site/Remote/Hybrid), location, job type (Full-time/Part-time/Contract/Internship)

Step 2 — Description: Rich text editor for job description, responsibilities, requirements, benefits. Skill tags with autocomplete.

Step 3 — Application Settings: Easy Apply toggle, external URL, screening questions builder, must-have qualifications

Step 4 — Targeting: Experience level, industry, job function

Step 5 — Review & Post: Preview card, budget (for promoted), "Post for free" or "Promote this job"

**Prompt for AI Agent:**
> "Build LinkedIn's job posting creation flow. Multi-step form with progress indicator. Step 1: Job title, company, workplace type (On-site/Remote/Hybrid toggle pills), location autocomplete, job type (Full-time/Part-time/Contract/Internship). Step 2: Rich text editor for description, responsibilities, requirements. Skill tag input with autocomplete. Step 3: Easy Apply toggle, screening questions builder (add/remove questions), must-have qualifications. Step 4: Experience level, industry, function selectors. Step 5: Review preview card + 'Post for free' / 'Promote' buttons. Each step saves draft to backend. Published jobs appear on the recruiter dashboard."

---

### RECRUITER PAGE 3: Applicant Tracking / Pipeline (`/recruiter/jobs/:id/applicants`)

**Layout:** Kanban board OR list view toggle.

**Kanban Columns:** New → Reviewed → Shortlisted → Interview → Offer → Hired → Rejected

**Each Candidate Card (in Kanban):**
- Avatar, name, headline, match score (percentage badge), applied date
- Quick actions: Move to next stage, reject, message, view profile
- Drag-and-drop between columns

**List View:** Table with columns: Name, Applied Date, Stage, Match %, Source, Resume link, Actions dropdown.

**Filters:** Date applied, experience level, location, skills, match score range.

**Prompt for AI Agent:**
> "Build LinkedIn Recruiter's applicant tracking page. Toggle between Kanban and List views. Kanban: columns for New/Reviewed/Shortlisted/Interview/Offer/Hired/Rejected. Candidate cards: avatar, name, headline, match score badge, applied date, quick action icons (advance, reject, message, view). Drag-and-drop cards between columns — stage changes persist to backend. List view: sortable table with Name, Date, Stage, Match %, Source, Resume link, Actions dropdown. Filters sidebar: date, experience, location, skills, score range. Stage change triggers notification to candidate."

---

### RECRUITER PAGE 4: Candidate Search (`/recruiter/search`)

**Advanced Search with Filters:**
- Keywords, job title, company, location, industry, years of experience, education, skills, languages
- Boolean search support (AND, OR, NOT)
- Spotlight filters: Open to Work, Recently active, Willing to relocate

**Results:**
- Each: avatar, name, headline, current company, location, shared connections, match score
- Action buttons: "Save", "Message" (InMail), "Add to Pipeline"
- Bulk actions: Select multiple → Save to project, Send bulk InMail

**Prompt for AI Agent:**
> "Build LinkedIn Recruiter's candidate search page. Advanced search form: keyword, job title, company, location, industry, years of experience, education, skills, languages. Boolean support (AND/OR/NOT). Spotlight filters: Open to Work, Recently Active, Willing to Relocate. Results: candidate cards with avatar, name, headline, current company, location, shared connections, match score (circular progress). Actions: Save, InMail, Add to Pipeline. Bulk select with batch actions. Paginated results with count. Search queries saveable for future use."

---

### RECRUITER PAGE 5: Candidate Profile (Recruiter View) (`/recruiter/profile/:id`)

**Enhanced profile view with recruiter-specific panels:**

Same as member profile but with added sections:
- "Recruiting Activity" sidebar: notes, tags, pipeline stage, activity log
- "InMail History" panel: sent/received messages with this candidate
- "Similar Profiles" recommendations
- "Open to Work" details (if visible): desired titles, locations, start date
- Action bar: "Save to Pipeline", "Send InMail", "Add Tags", "Share Profile" (with other recruiters)

**Prompt for AI Agent:**
> "Build LinkedIn Recruiter's candidate profile view. Full member profile layout PLUS recruiter-specific panels: Recruiting Activity sidebar (notes with add/edit, tags with color labels, current pipeline stage dropdown, activity log timeline), InMail History panel (sent/received messages), Similar Profiles carousel, Open to Work details (desired titles, locations, start date — visible only if candidate enabled this). Top action bar: 'Save to Pipeline' (dropdown with project selection), 'Send InMail', 'Add Tags', 'Share with Team'. All notes, tags, and stage changes persist to recruiter backend."

---

### RECRUITER PAGE 6: InMail Center (`/recruiter/inbox`)

**Same structure as regular messaging but with:**
- InMail credits counter (top of sidebar)
- Template library: saved InMail templates with insert support
- Response rate analytics per template
- Candidate context card in right panel header (current role, skills, match reason)
- "Smart Suggestions": AI-generated personalized openers based on candidate profile

**Prompt for AI Agent:**
> "Build LinkedIn Recruiter's InMail center. Same 2-panel messaging layout as member messaging, but with: InMail credits counter in header, template library panel (saved templates with insert button, response rate % per template), candidate context card above conversation (current role, key skills, match reason), Smart Suggestion box (AI-generated opener based on candidate profile). Compose area supports template variables like {firstName}, {company}, {role}. Track InMail sends, opens, and replies. Credits decrement on send."

---

### RECRUITER PAGE 7: Recruiting Analytics (`/recruiter/analytics`)

**Dashboard with charts and metrics:**

- Hiring funnel: bar chart showing drop-off at each stage
- Time to hire: average days per role (line chart over time)
- Source effectiveness: pie chart (LinkedIn Apply, External, Referral, InMail)
- InMail analytics: sent, opened, replied, accepted rates
- Job post performance: views, clicks, applies per job
- Diversity metrics (optional): pipeline demographics

**Date range selector** at top. **Export to CSV/PDF** button.

**Prompt for AI Agent:**
> "Build LinkedIn Recruiter's analytics dashboard. Date range selector at top. Charts: Hiring funnel (horizontal bar chart with stage counts and conversion rates), Time to hire (line chart, average days per role over months), Source effectiveness (donut chart: LinkedIn Apply, External, Referral, InMail), InMail performance (sent/opened/replied/accepted as bar groups), Job post performance (table: views/clicks/applies per job). Each chart in its own white card. Export buttons: CSV and PDF. All data from backend analytics APIs. Use a charting library like Recharts or Chart.js."

---

### RECRUITER PAGE 8: Team & Collaboration (`/recruiter/team`)

**Team Members List:**
- Each: avatar, name, role (Admin/Recruiter/Coordinator), active jobs count, InMails sent this month
- Add team member button

**Shared Projects:**
- List of hiring projects with: role title, stage breakdown mini bar, team members assigned, last activity date
- Click to open project pipeline

**Prompt for AI Agent:**
> "Build LinkedIn Recruiter's team management page. Team members list: avatar, name, role badge (Admin/Recruiter/Coordinator), stats (active jobs, InMails sent this month), edit/remove actions. 'Add Team Member' button opens invite modal. Shared Projects section: list of hiring projects with role title, mini pipeline stage bar (colored segments for each stage), assigned team members (overlapping avatars), last activity. Clicking a project navigates to its applicant pipeline. Admin can manage permissions."

---

## 5. Shared Components Library

Build these as reusable components before building pages:

| Component | Description | Key Props |
|---|---|---|
| `Avatar` | Circle image with fallback initials, size variants (24/32/40/48/72/152px), online dot, Open to Work frame | `src, name, size, showOnline, showOTW` |
| `PostCard` | Full post with all engagement | `post, onLike, onComment, onRepost` |
| `CommentThread` | Recursive nested comments | `comments, onReply, onLike` |
| `ReactionPicker` | 6-emoji hover popup | `onSelect, currentReaction` |
| `ConnectionCard` | Suggestion card with connect | `user, mutualCount, onConnect` |
| `JobCard` | Job listing row | `job, onSave, onApply` |
| `NavBar` | Top nav with search and icons | `activeTab, user, notifications` |
| `ProfileMiniCard` | Left sidebar profile summary | `user` |
| `SearchBar` | Pill-shaped with autocomplete | `onSearch, placeholder` |
| `Modal` | Generic overlay modal | `isOpen, onClose, title, children` |
| `DropdownMenu` | Three-dot or select dropdown | `items, onSelect` |
| `Toast` | Success/error notifications | `message, type, duration` |
| `Badge` | Count badges, status pills | `count, type, label` |
| `ToggleSwitch` | Settings toggle | `checked, onChange, label` |
| `TabBar` | Horizontal tab navigation | `tabs, activeTab, onChange` |
| `InfiniteScroll` | Scroll-triggered data loading | `onLoadMore, hasMore, loader` |
| `ImageGrid` | 1/2/3/4+ image layout | `images, onImageClick` |
| `RichTextEditor` | Post/article editor | `value, onChange, toolbar` |
| `KanbanBoard` | Drag-and-drop columns | `columns, cards, onDragEnd` |
| `MetricCard` | Dashboard stat with sparkline | `label, value, trend, chart` |
| `MessageBubble` | Chat message left/right | `message, isSent, timestamp` |
| `SkeletonLoader` | Loading placeholder shapes | `type (card/list/avatar)` |

---

## 6. Data Models & State Management

### Core Entities (Frontend State)

```
User {
  id, firstName, lastName, headline, profilePhoto, bannerPhoto,
  location, about, connectionCount, followerCount, isOpenToWork,
  currentPosition, education[], skills[], endorsements[],
  experience[], certifications[], interests[], pronouns,
  isVerified, isPremium, profileUrl
}

Post {
  id, author: User, content, mediaType (text/image/video/document/poll/article),
  media[], createdAt, editedAt, visibility (public/connections),
  reactions: { like, celebrate, support, love, insightful, funny },
  commentCount, repostCount, shareCount, comments: Comment[],
  isRepost, originalPost?, hashtags[], mentions[]
}

Comment {
  id, author: User, content, createdAt, likes, replies: Comment[],
  parentId?, mentions[]
}

Job {
  id, title, company: Company, location, workplaceType, jobType,
  description, requirements, responsibilities, benefits,
  skills[], experienceLevel, applicantCount, postedAt,
  isEasyApply, isPromoted, isSaved, applicationUrl
}

Company {
  id, name, logo, banner, industry, tagline, website,
  size, headquarters, founded, type, specialties[],
  followerCount, employeeCount, about
}

Message {
  id, sender: User, receiver: User, content, sentAt,
  readAt, attachments[], isInMail
}

Notification {
  id, type, actor: User, target (post/job/profile),
  message, createdAt, isRead
}

Connection {
  id, user: User, status (pending/accepted/rejected),
  connectedAt, mutualConnections: User[]
}

-- Recruiter-Specific --

Pipeline {
  id, jobId, stages: PipelineStage[]
}

PipelineStage {
  name (New/Reviewed/Shortlisted/Interview/Offer/Hired/Rejected),
  candidates: CandidateCard[]
}

CandidateCard {
  id, user: User, appliedAt, matchScore, stage,
  notes: Note[], tags: Tag[], inMailHistory: Message[],
  resume?, source (apply/inmail/referral)
}

RecruiterProject {
  id, title, job: Job, team: User[], pipeline: Pipeline,
  createdAt, lastActivity
}
```

### State Management Recommendations

Use Redux Toolkit or Zustand with slices: `authSlice`, `feedSlice`, `profileSlice`, `jobsSlice`, `messagingSlice`, `notificationsSlice`, `networkSlice`, `recruiterSlice`. Implement optimistic updates for likes, comments, and connection requests. Use React Query or SWR for server state caching and real-time invalidation.

---

## 7. Backend Changes Required

### New API Endpoints Needed

**Authentication & User:**
- `POST /api/auth/register` — signup with email/password
- `POST /api/auth/login` — login, returns JWT
- `GET /api/users/:id` — full profile
- `PUT /api/users/:id` — update profile sections
- `POST /api/users/:id/banner` — upload banner image
- `POST /api/users/:id/photo` — upload profile photo

**Feed & Posts:**
- `GET /api/feed` — paginated feed (query: `?page=&limit=&sort=top|recent`)
- `POST /api/posts` — create post (multipart for media)
- `PUT /api/posts/:id` — edit post
- `DELETE /api/posts/:id` — delete post
- `POST /api/posts/:id/reactions` — add reaction (body: `{ type: "like" | "celebrate" | ... }`)
- `DELETE /api/posts/:id/reactions` — remove reaction
- `GET /api/posts/:id/reactions` — get reaction breakdown
- `POST /api/posts/:id/comments` — add comment
- `POST /api/posts/:id/comments/:commentId/replies` — add nested reply
- `POST /api/posts/:id/repost` — repost
- `POST /api/posts/:id/share` — share via messaging

**Connections & Network:**
- `GET /api/network/invitations` — pending invitations
- `POST /api/network/connect/:userId` — send connection request
- `PUT /api/network/invitations/:id` — accept/reject
- `GET /api/network/suggestions` — people you may know
- `GET /api/network/connections` — your connections list
- `GET /api/users/:id/mutual-connections` — mutual connections

**Jobs:**
- `GET /api/jobs` — search jobs (query params for filters)
- `GET /api/jobs/:id` — job detail
- `POST /api/jobs` — create job (recruiter)
- `PUT /api/jobs/:id` — edit job
- `POST /api/jobs/:id/apply` — apply (Easy Apply)
- `POST /api/jobs/:id/save` — save/bookmark job
- `GET /api/jobs/saved` — saved jobs
- `GET /api/jobs/applied` — applied jobs

**Messaging:**
- `GET /api/messages/conversations` — conversation list
- `GET /api/messages/conversations/:id` — messages in conversation
- `POST /api/messages/conversations/:id` — send message
- `PUT /api/messages/:id/read` — mark as read
- WebSocket endpoint: `/ws/messaging` — real-time messages and typing indicators

**Notifications:**
- `GET /api/notifications` — paginated notifications
- `PUT /api/notifications/:id/read` — mark read
- `PUT /api/notifications/read-all` — mark all read
- WebSocket endpoint: `/ws/notifications` — real-time notification push

**Search:**
- `GET /api/search` — unified search (query: `?q=&type=people|posts|jobs|companies|groups`)
- `GET /api/search/autocomplete` — typeahead suggestions

**Companies:**
- `GET /api/companies/:id` — company page
- `POST /api/companies/:id/follow` — follow/unfollow
- `GET /api/companies/:id/jobs` — company's jobs
- `GET /api/companies/:id/employees` — employees on platform

**Groups:**
- `GET /api/groups/:id` — group detail
- `POST /api/groups/:id/join` — join group
- `GET /api/groups/:id/posts` — group feed
- `POST /api/groups/:id/posts` — post to group

**Analytics (Member):**
- `GET /api/analytics/profile-views` — who viewed your profile
- `GET /api/analytics/post-impressions` — post/article analytics
- `GET /api/analytics/search-appearances` — search stats

**Recruiter-Specific:**
- `GET /api/recruiter/dashboard` — dashboard metrics
- `POST /api/recruiter/jobs` — post job
- `GET /api/recruiter/jobs/:id/applicants` — applicants list
- `PUT /api/recruiter/applicants/:id/stage` — move candidate stage
- `POST /api/recruiter/applicants/:id/notes` — add note
- `POST /api/recruiter/applicants/:id/tags` — add tag
- `GET /api/recruiter/search` — advanced candidate search
- `POST /api/recruiter/inmail` — send InMail (deducts credits)
- `GET /api/recruiter/inmail/templates` — saved templates
- `GET /api/recruiter/analytics` — hiring analytics
- `GET /api/recruiter/team` — team members
- `POST /api/recruiter/team/invite` — invite team member
- `GET /api/recruiter/projects` — hiring projects

### Infrastructure Requirements

- **File Storage:** S3-compatible storage (AWS S3, MinIO) for profile photos, banners, post media, resumes, documents
- **Real-time:** WebSocket server (Socket.io or native WS) for messaging and notifications
- **Search:** Elasticsearch or Typesense for full-text search across users, posts, jobs, companies
- **Caching:** Redis for session management, feed caching, online status tracking
- **Queue:** Bull/BullMQ or RabbitMQ for notification dispatch, email sending, analytics computation
- **Database Changes:** Add tables/collections for reactions (type enum), nested comments (parent_id), pipeline stages, recruiter notes, tags, InMail credits, analytics events

---

## 8. Icon & Asset Strategy

### Recommended Icon Sources

Use **Flaticon** or **Lucide React** for 1:1 LinkedIn-like icons. Here is the exact mapping:

| UI Element | Icon Name (Lucide) | Flaticon Search Term |
|---|---|---|
| Home nav | `Home` | "home filled" |
| Network nav | `Users` | "people group" |
| Jobs nav | `Briefcase` | "briefcase" |
| Messaging nav | `MessageSquare` | "chat bubble" |
| Notifications nav | `Bell` | "bell notification" |
| Like | `ThumbsUp` | "thumbs up" |
| Celebrate | — | "clapping hands emoji" |
| Support | — | "heart hands emoji" |
| Love | `Heart` | "red heart" |
| Insightful | — | "lightbulb" |
| Funny | — | "laughing face emoji" |
| Comment | `MessageCircle` | "comment bubble" |
| Repost | `Repeat2` | "repost arrows" |
| Send/Share | `Send` | "paper plane" |
| Save/Bookmark | `Bookmark` | "bookmark ribbon" |
| Edit/Pencil | `Pencil` | "pencil edit" |
| Settings/Gear | `Settings` | "gear settings" |
| Search | `Search` | "magnifying glass" |
| Close | `X` | "close x" |
| More menu | `MoreHorizontal` | "three dots horizontal" |
| Add/Plus | `Plus` | "plus circle" |
| Image upload | `Image` | "image landscape" |
| Video | `Video` | "video camera" |
| Document | `FileText` | "document file" |
| Calendar/Event | `Calendar` | "calendar date" |
| Location | `MapPin` | "location pin" |
| Link | `Link` | "chain link" |
| Globe (public) | `Globe` | "globe earth" |
| Lock (private) | `Lock` | "lock padlock" |
| Verified badge | `BadgeCheck` | "verified checkmark" |
| Premium badge | `Crown` | "crown gold" |
| Arrow up/trend | `TrendingUp` | "arrow trend up" |
| External link | `ExternalLink` | "external link arrow" |
| Filter | `SlidersHorizontal` | "filter sliders" |
| Download | `Download` | "download arrow" |
| Trash/Delete | `Trash2` | "trash bin delete" |
| Eye/Views | `Eye` | "eye view" |
| Connect (person+) | `UserPlus` | "person plus add" |

### LinkedIn Reaction Emojis

Use actual emoji images or SVG recreations for the 6 LinkedIn reactions. These should be small circular icons (~20px) that appear in a hover popover above the Like button:

👍 Like (blue thumbs up on blue circle), 👏 Celebrate (green clapping hands on green circle), ❤️ Love (red heart on red circle), 💡 Insightful (yellow lightbulb on yellow circle), 😂 Funny (purple laughing face on purple circle), 🤗 Support (purple heart-hands on purple circle)

---

## 9. Execution Order & Priority

### Phase 1 — Foundation (Week 1-2)
1. Design system setup (CSS variables, typography, spacing)
2. Shared components library (Avatar, Button, Card, NavBar, Modal, Toast)
3. Authentication flow (Login, Register, JWT)
4. Global navigation shell

### Phase 2 — Core Member Pages (Week 3-5)
5. Profile page (most complex, do first)
6. Home feed with post cards and reactions
7. Create post modal
8. My Network page
9. Notifications page

### Phase 3 — Communication & Discovery (Week 6-7)
10. Messaging (with WebSocket real-time)
11. Search results page
12. Jobs hub + job detail

### Phase 4 — Recruiter Suite (Week 8-10)
13. Recruiter dashboard
14. Job posting creation flow
15. Applicant tracking / Kanban pipeline
16. Candidate search
17. Candidate profile (recruiter view)
18. InMail center
19. Recruiting analytics
20. Team management

### Phase 5 — Polish & Secondary Pages (Week 11-12)
21. Company pages
22. Groups
23. Events
24. Settings & Privacy
25. Who Viewed Your Profile / Creator Dashboard
26. Learning page
27. Responsive / mobile layout pass
28. Accessibility audit (ARIA labels, keyboard nav, focus management)

---

## Key Principles for Every Page

1. **White cards on warm gray background (`#F4F2EE`)** — never pure white or pure gray page bg.
2. **Card borders are `1px solid rgba(0,0,0,0.08)`** with `border-radius: 8px` — no heavy shadows.
3. **All text is `rgba(0,0,0,0.9)` for primary, `rgba(0,0,0,0.6)` for secondary** — never pure black or pure gray.
4. **Buttons are pill-shaped (`border-radius: 16px`)** for primary/secondary, square for ghost.
5. **No bright gradients, no neon, no fancy effects** — LinkedIn's design is deliberately understated and professional.
6. **Maximum content width is `1128px`, centered** — never full-bleed content.
7. **Every interactive element needs hover, focus, and active states.**
8. **Skeleton loaders for all async content** — never empty white space while loading.
9. **Optimistic UI updates** — likes, comments, connects feel instant.
10. **Responsive breakpoints:** Desktop (>1128px), Tablet (768-1127px, 2-column collapse), Mobile (<768px, single column, bottom tab nav).
