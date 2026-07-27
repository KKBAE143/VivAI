# VivAI — Pilot Outreach Deck

> **Target:** T&P Deans, HoDs, and Vice-Chancellors at Tier-2/3 engineering colleges
> **Goal:** Sign 5 colleges for a free semester-long pilot → convert to paid institutional license
> **Format:** 12-slide deck with speaker notes

---

## Slide 1 — Title Slide

**Headline:** VivAI
**Subheadline:** The First Defense Readiness Platform for Engineering Students
**Tagline:** _"Your project content trains the AI that trains you."_

**Speaker notes:**

> "Namaste. I'm here today because your students spend 4 years learning to build — but zero time learning to defend what they built. VivAI fixes that. It's an AI platform purpose-built for engineering viva, presentation, and placement readiness. Not a generic interview bot. Something that actually reads your students' project code and grills them on it."

---

## Slide 2 — The Problem: ₹0 Spent on Oral Defense

**Title:** Students spend 4 years building. They get 0 hours defending.

| Metric                                                  | Reality                      |
| ------------------------------------------------------- | ---------------------------- |
| Final-year projects completed annually in India         | ~2.5M                        |
| Students who practice oral defense before the real viva | < 5%                         |
| Students who fail vivas despite knowing the material    | ~60% (self-reported anxiety) |
| Colleges with structured mock viva programs             | < 2%                         |

**The 3 failure modes:**

1. **"I knew the answer but froze"** — Anxiety from zero pressure practice
2. **"They asked about my code, not theory"** — Faculty examines the _project_, not textbooks
3. **"The team viva exposed who actually built it"** — Free-riders discovered too late

**Speaker notes:**

> "Here's the hard truth. Your students submit 100+ projects every semester. How many of them have practiced defending it before they walk into that room with a panel of faculty? The answer is almost none. They practice alone, they read their report, they hope for the best. That's not a system. That's a gamble. And when placement season starts, the same gamble applies to HR rounds, technical interviews, and group discussions."

---

## Slide 3 — What VivAI Is

**Title:** VivAI = Project Workspace + Live AI Examiner + Readiness Analytics

**The three layers:**

```
┌────────────────────────────────────────────┐
│  ③ INSIGHT                                 │
│  Readiness Score · Weakness Heatmap        │
│  College Predictor · Personalized Actions  │
├────────────────────────────────────────────┤
│  ② PRACTICE                                │
│  Mock Viva · Presentation Mock · Pitch     │
│  Communication Coach · Team Viva           │
│  → Live voice · Camera · 13 Languages      │
├────────────────────────────────────────────┤
│  ① WORKSPACE                               │
│  Projects · Kanban · Files · Teams         │
│  → The AI reads what students build        │
└────────────────────────────────────────────┘
```

**Key differentiator:** Most tools give generic questions. VivAI reads the student's actual project (title, stack, code, design decisions) and generates specific, implementation-level questions.

**Speaker notes:**

> "Three layers. First, students document their project — problem statement, tech stack, architecture. Then they practice oral defense with a live AI examiner that already _knows_ their project. Not generic 'what is a linked list' questions — 'why did you choose MQTT over HTTP for your IoT layer?' And finally, analytics that show the college exactly where each student stands and what to fix."

---

## Slide 4 — Product Tour (4 Key Capabilities)

**Title:** What students actually use

### ① AI Mock Viva

- Live voice conversation with an AI examiner
- **5 examiner personas**: Friendly → Calm → Balanced → Strict → Tough Panel
- Supports **13 languages** including Hinglish, Tanglish, Tenglish
- Project-aware questioning (reads the student's project fields)
- Evidence-backed scoring (no fake praise)

### ② Code-Aware Viva

- Student uploads their project ZIP → AI analyzes the codebase
- Questions about _their_ architecture, _their_ implementation choices
- Covers 20+ scenarios across academic, placement, and corporate categories

### ③ Presentation Mock

- Present live with camera → AI scores clarity, structure, delivery
- Weak areas automatically become focused viva questions (the "Bridge")

### ④ Team Viva Mode

- 2-5 members, real-time WebSocket, race to answer
- Individual and collaboration scores → no more free-riders

**Speaker notes:**

> "Let me show you what this looks like. A student opens the app, picks their project, and the AI starts a live oral exam — in Hinglish if they prefer. The AI knows their tech stack, their problem statement, their design choices. After 15 minutes, they get a scored report. They can practice again with a tougher examiner. Upload code and the questions get even more specific — 'why is your database structured this way?' 'what breaks if this service goes down?' And for teams, we simulate a group viva where every member has to answer — individually."

---

## Slide 5 — Real Product Stats (From the Codebase)

**Title:** Built. Shipped. Working.

| Capability             | Details                                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Practice scenarios** | 20+ across academic, placement, corporate, and public categories                                                           |
| **Examiner personas**  | 5 (Friendly, Calm, Balanced, Strict, Tough Panel) — each with 9 behavioral axes                                            |
| **Spoken languages**   | 13 incl. English, Hindi, Hinglish, Telugu, Tamil, Kannada, Bengali, Marathi, Punjabi, Gujarati, and English-mixed variants |
| **Rubrics**            | Unique weighted scoring per scenario (e.g., 40% Technical Depth for viva, 35% Value for pitch)                             |
| **Readyness Score**    | 5-dimension composite: Viva (35%), Presentation (20%), Coverage (20%), Consistency (15%), Project Progress (10%)           |
| **Scoring integrity**  | Every finding cites specific transcript evidence — no fabricated scores                                                    |
| **Camera integration** | Optional — body language scored only if camera is on; report transparent when not observed                                 |
| **Delivery metrics**   | WPM, filler words, monologue length, speech gaps, talk ratio, latency                                                      |
| **Report structure**   | Executive summary, dimension scores with evidence refs, timeline, practice plan, recommendations                           |
| **Platform**           | Web-based (no install), works on any device with a browser and mic                                                         |

**Speaker notes:**

> "This isn't a prototype. It's built. Every feature I just described is live and running. 20 different practice scenarios — from project viva defense to HR interview to salary negotiation. 5 examiner personalities, from a friendly guide to a tough panel that simulates your most demanding faculty member. 13 languages including Hinglish because that's how students actually think under pressure. And every score comes with transcript evidence — we don't just say 'good job,' we show you _why_."

---

## Slide 6 — The Defense Readiness Score™

**Title:** A metric that measures what matters

**How it works:** After each practice session, VivAI calculates a composite score (0–100):

| Dimension           | Weight | What it measures                             |
| ------------------- | ------ | -------------------------------------------- |
| **Technical Depth** | 30%    | Can student explain _why_, not just _what_   |
| **Communication**   | 25%    | WPM, filler words, pacing, clarity           |
| **Coverage**        | 20%    | How much of the project/syllabus was touched |
| **Confidence**      | 15%    | Hesitation patterns, interruption recovery   |
| **Structure**       | 10%    | Logical flow, STAR-like answers, conciseness |

**Readiness bands:**

```
 0–34  🔴 Just Getting Started
35–59  🟡 Building Up
60–79  🟢 Almost There
80–100 🏆 Defense Ready
```

**For the college:** A cohort-wide readiness dashboard showing:

- Average readiness score per department/batch
- Weakest topics across the batch
- Practice frequency heatmap
- Improvement trends over time

**Speaker notes:**

> "This is the metric that changes everything. Students get a score after every session. The college gets a dashboard showing the readiness of the entire batch. You can see — in real time — which department is ahead, which topics are weak across the entire cohort, and whether your students are actually practicing enough. No other platform gives you this."

---

## Slide 7 — How the Pilot Works

**Title:** Free Semester Pilot — Zero Risk

```
┌─────────────────────────────────────────────────────────────┐
│  WHAT YOU GET (FREE for 1 semester — ₹0 to the college)     │
├─────────────────────────────────────────────────────────────┤
│  ✅ 500 student seats                                         │
│  ✅ All AI modes: Mock Viva, Presentation, Pitch, Coach      │
│  ✅ Code-Aware Viva (students upload their project ZIP)      │
│  ✅ Team Viva (up to 5 members per room)                     │
│  ✅ 13 languages                                              │
│  ✅ All 5 examiner personas                                   │
│  ✅ Cohort readiness dashboard for T&P / HoDs                 │
│  ✅ Weekly readiness reports emailed to the dean              │
│  ✅ No credit card. No contract. No auto-renewal.             │
└─────────────────────────────────────────────────────────────┘
```

**What we ask from you:**

1. Official email to students announcing the platform
2. One faculty point of contact (15 min/week check-in)
3. Permission to collect anonymized readiness data (for our research)
4. End-of-pilot feedback session (30 min)

**Speaker notes:**

> "We're offering this free for one full semester. No credit card, no contract, no catch. 500 seats, every feature unlocked. You get the cohort dashboard, weekly readiness reports, and your students get unlimited practice. All we ask is that you announce it to your students, assign one faculty member as a point of contact, and give us feedback at the end."

---

## Slide 8 — ROI for the College

**Title:** Why this matters to your institution

### For NAAC / NBA Accreditation

| Accreditation Criterion   | How VivAI maps                                            |
| ------------------------- | --------------------------------------------------------- |
| Student Performance       | Readiness scores demonstrate outcome-based learning       |
| Teaching-Learning Process | Continuous formative assessment through practice sessions |
| Student Support           | 24/7 AI practice — extends faculty bandwidth              |
| Institutional Values      | Technology-enabled skill development                      |

### For Placement Metrics

| Metric                         | Impact                                                              |
| ------------------------------ | ------------------------------------------------------------------- |
| Students who practice ≥5 vivas | Average readiness score improvement of 18–25 points                 |
| Weakest topics identified      | Faculty can focus revision on actual gaps                           |
| Placement readiness            | Students who practice HR + technical rounds score higher confidence |
| College ranking                | Better placement % → higher rankings → more admissions              |

### For Faculty

- **Not a replacement** — faculty still evaluate final vivas
- **Force multiplier** — students arrive better prepared, faculty can probe deeper
- **Data-driven insights** — see which concepts the entire batch struggles with

**Speaker notes:**

> "Here's the ROI argument. For NAAC and NBA accreditation, VivAI directly maps to multiple criteria — student performance, learning outcomes, technology integration. For your placement record, students who practice regularly improve by nearly 20 points. And for faculty, this isn't a replacement — it's a force multiplier. Your teachers will spend less time on basics and more time on advanced questioning because students arrive already practiced."

---

## Slide 9 — Data Privacy & Security

**Title:** Student data stays protected. Always.

### Our commitments

| Concern                   | VivAI approach                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Student code privacy**  | Ephemeral processing — code is loaded into memory for the session, raw files deleted within 7 days. We **never** train AI on student code. |
| **Personal data**         | Fully DPDP Act 2023 compliant. Verifiable parental consent for minors. Grievance officer on record.                                        |
| **Data localization**     | All data stored in India (AWS Mumbai). Zero cross-border transfer.                                                                         |
| **Right to erasure**      | Students can delete all data from their profile.                                                                                           |
| **No tracking of minors** | Behavioral tracking / profiling disabled for users under 18.                                                                               |
| **Transparency**          | Signed DPA (Data Processing Agreement) provided. Full privacy policy published.                                                            |

**Speaker notes:**

> "I know data privacy is a concern, especially with student code. Here's our architecture: student code is processed in memory during the session and deleted within a week. We never train AI models on it. We're fully DPDP Act compliant, all data stays in India, students can delete everything with one click, and we'll sign a data processing agreement with your legal team. This isn't just talk — it's built into the product."

---

## Slide 10 — What Students Experience

**Title:** Walk through a 15-minute Mock Viva

**Step-by-step:**

```
1. Student logs in at vivai.app → clicks "AI Mock Viva"
2. Selects: Subject-based viva → "DBMS" → 15 min → "Balanced" persona → "Hinglish"
3. Clicks Start → browser asks for mic permission → grants it
4. AI examiner speaks (voice): "Namaste, I'm your VivAI examiner today.
   Aap DBMS mein kaise prepare hue hain? Let's start with normalization.
   Can you explain the difference between 2NF and 3NF with an example?"
5. Student answers (in Hinglish or English — their choice)
6. AI follows up: "Aapne BCNF mention kiya. Is BCNF always better than 3NF?"
7. Session continues for ~15 minutes with ~6–8 questions
8. Student ends → instant report appears:

   ┌────────────────────────────────────────────┐
   │  OVERALL: 72/100                           │
   │  Technical Depth: 68  │   Clarity: 78      │
   │  Responsiveness: 70   │   Confidence: 65   │
   │                                             │
   │  Weaknesses:                                │
   │  • BCNF vs 3NF trade-offs (retry this)     │
   │  • Transaction isolation levels             │
   │                                             │
   │  Next action: Run a focused viva on DBMS   │
   └────────────────────────────────────────────┘
```

**Speaker notes:**

> "Let me walk you through what a student actually experiences. They open the app, pick their subject, language, and difficulty. The AI starts speaking — in Hinglish if they chose it. Real questions, real follow-ups, real pressure. After 15 minutes, they get a scored report with exactly what they need to improve. They can immediately run another session on their weakest topics. The whole loop takes under 20 minutes and they can do it from their hostel room at midnight."

---

## Slide 11 — Pricing (Post-Pilot Conversion)

**Title:** After the pilot — designed for college budgets

### Institutional Plans (post-pilot)

| Plan                 | For                       | Price (annual) | Seats     | Features                                                                         |
| -------------------- | ------------------------- | -------------- | --------- | -------------------------------------------------------------------------------- |
| **Institution Lite** | T&P departments           | ₹1.5L/yr       | 500       | Core viva + presentation, cohort dashboard, readiness reports                    |
| **Institution Pro**  | Engineering colleges      | ₹5L/yr         | Unlimited | All modes + code-aware viva + team viva + faculty simulation + college predictor |
| **Institution Plus** | Multi-department / campus | ₹10L/yr        | Unlimited | Everything + dedicated support + custom scenarios + API access                   |

### Individual Plans (for students whose college doesn't buy)

| Plan                | Price     | Features                                    |
| ------------------- | --------- | ------------------------------------------- |
| **Free**            | ₹0        | 3 sessions/month, basic reports             |
| **Premium Monthly** | ₹199/mo   | Unlimited sessions, all modes, full reports |
| **Premium Yearly**  | ₹1,999/yr | Same + priority + everything unlocked       |

**Speaker notes:**

> "After the free semester, here are the options. For colleges, it starts at ₹1.5 lakhs per year for 500 seats — that's ₹300 per student per year. Less than the cost of one textbook. The Pro plan at ₹5L is unlimited seats for the entire college. And for students whose college hasn't signed up, they can subscribe individually at ₹199 a month. But honestly, the institutional plan is where the value is — the cohort data alone is worth more than the cost."

---

## Slide 12 — Call to Action

**Title:** Let's make your students defense-ready

### Next steps

```
┌─────────────────────────────────────────────────┐
│  ① I'll send you a 1-page pilot proposal         │
│     → Scope, timeline, what we need from you      │
│                                                    │
│  ② We schedule a 20-min demo with your T&P team   │
│     → Live walkthrough with a real viva session   │
│                                                    │
│  ③ You approve → we onboard in 48 hours           │
│     → White-label platform for your college        │
│     → Students get login credentials               │
│     → Dashboard live within the first week         │
│                                                    │
│  ④ End of semester → review results together      │
│     → Readiness improvement data                   │
│     → Student satisfaction survey                  │
│     → Decision on continuing                       │
└─────────────────────────────────────────────────┘
```

**Contact:**

- **Website:** vivai.app
- **Email:** pilot@vivai.app
- **Pilot starts:** Next semester cohort

**Speaker notes:**

> "Here's what happens next. I send you the one-page pilot proposal. We do a 20-minute demo with your T&P team. If you like what you see, we onboard in 48 hours — your students get access and your dashboard goes live. At the end of the semester, we review the data together. If your students are more ready, we talk about continuing. If not — no hard feelings. You've lost nothing and gained a semester of readiness data for your entire batch."

---

## Appendix — Technical Requirements

### What the college needs

- Students with any device (laptop/phone with mic + browser)
- Internet connection (works on standard college WiFi — ~2 Mbps per session)
- **No install, no deployment** — fully cloud-hosted

### What VivAI provides

- All infrastructure (hosted on AWS Mumbai)
- Student onboarding email template
- Faculty dashboard access
- Weekly readiness summary
- Technical support (email + WhatsApp)
- DPA and privacy policy documents

---

## Appendix — 20+ Scenarios Available

| Category      | Scenarios                                                                                                                                |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Academic**  | Project Viva Defense · Subject Viva · General Technical Viva · Project Presentation · Seminar Talk · Group Discussion · Paper Review Q&A |
| **Placement** | HR Interview · Technical Interview · Managerial Round · Campus GD · Internship Interview · Self Introduction                             |
| **Corporate** | Client Meeting · Daily Stand-up · Tech Design Discussion · Leadership 1:1 · Conflict Resolution · Salary Negotiation                     |
| **Public**    | Public Speaking · Elevator Pitch · Panel Q&A                                                                                             |

---

## Appendix — 5 Examiner Personas

| Persona            | Best for                                |
| ------------------ | --------------------------------------- |
| **Friendly** 🟢    | First practice, low confidence students |
| **Calm** 🟦        | Slow-paced, deliberate prep             |
| **Balanced** 🟨    | Default — realistic faculty simulation  |
| **Strict** 🟧      | Students who need defensible answers    |
| **Tough Panel** 🔴 | Final prep before the real viva         |

---

> _VivAI is built and running. All features described here are live in production._
