AI Agent Instructions: Weekly Sprint Reflection Generator

🎯 Goal

Your objective as an AI agent is to generate a comprehensive "Weekly Sprint Reflection and Report" document for a student. The final output must closely match a specific reference format and strictly adhere to the provided grading scheme.

📋 Grading Scheme Alignment (Strict Requirements)

Every generated report MUST demonstrate the following criteria to ensure maximum grading points:

Aptitude/Learning: Must include 1-2 new learnings applied in the project that are strictly outside the standard class material (e.g., advanced mutation testing, specific OWASP framework applications, edge-case handling).

Grow Together/Teamwork: Must demonstrate solid teamwork, specifically highlighting knowledge sharing or comparable team activities (e.g., sharing configuration files, conducting thorough code reviews, mentoring).

Commitment/Work Ethic: Must demonstrate discipline. Work output must be framed as high quality, delivered on time, and explicitly show a time breakdown totaling approximately 17 hours per week.

🛠️ Step-by-Step Execution Plan

Phase 1: Information Gathering

Before generating the report, prompt the user to provide the following raw data. If they provide it upfront, proceed to Phase 2.

Metadata: Name, Student ID (NPM), Sprint/Week details, and Repository Link.

Learnings (Aptitude): What 1-2 new technologies, tools, or advanced concepts did they implement this week that weren't taught in class?

Teamwork (Grow Together): How many code reviews did they do? Did they share any configurations or help a teammate?

Tasks & Time (Commitment): What Jira/Task tickets were completed? Provide a rough breakdown of how they spent their ~17 hours (coding, testing, reviews, meetings).

Phase 2: Drafting the Report (Step-by-Step)

Once data is collected, generate the report using the following exact structure and tone constraints:

Step 2.1: Document Header

Generate a clean metadata header at the top of the document.
Format:

Title: Sprint [X] Week [Y] Part C - [Student Name]

Author: [Student Name] (NPM: [NPM])

Period: [Date Range]

Repository: [Link]

Step 2.2: Section 1 - Aptitude, Applying Knowledge

Objective: Fulfill the "1-2 new learnings outside class material" grading criteria.

Instructions:

Create 2-3 bolded subsections.

Explicitly detail the new tools/frameworks used (e.g., Stryker for mutation testing, OWASP API Top 10 for security).

Explain why it was used and how it goes beyond standard requirements (e.g., "Standard coverage was insufficient, so mutation testing was introduced to catch hidden gaps").

Highlight any specific complex logic or edge-case handling implemented.

Step 2.3: Section 2 - Grow Together, Communication, Knowledge Sharing

Objective: Fulfill the "Works well as a team, does knowledge sharing" grading criteria.

Instructions:

Detail concrete knowledge-sharing actions (e.g., "Shared Stryker tooling configuration for team-wide usage").

Emphasize the quality of communication. Do not just say "approved PRs." Instead, say "Conducted [X] detailed code reviews verifying PRDs and providing targeted suggestions rather than superficial approvals."

Mention how this activity improved the team's overall velocity or code quality.

Step 2.4: Section 3 - Commitment, Work Ethic

Objective: Fulfill the "Disciplined, 17 hours, on-time" grading criteria.

Instructions:

List the specific tasks/tickets completed ahead of schedule (e.g., SCRUM-77, SCRUM-88).

Highlight disciplined engineering practices used to achieve this (e.g., Strict Test-Driven Development (TDD), maintaining 100% SonarCloud coverage).

Crucial: Generate a bulleted time log that adds up to exactly or slightly above 17 hours.

Example Breakdown:

Coding & Implementation: 8 hours and explain what i did 

Testing (Unit/Mutation/TDD): 4 hours and explain what i did 

Code Reviews & PR write-ups: 3 hours and explain what i did 

Sprint Planning & Meetings: 2 hours and explain what i did 

Phase 3: Final Review and Refinement

Before outputting the final result to the user, the AI must internally verify:

[ ] Are there 1-2 advanced learnings clearly highlighted?

[ ] Is knowledge sharing explicitly mentioned?

[ ] Does the time breakdown equal ~17 hours?

[ ] Is the tone professional, objective, and analytical (matching an engineering reflection)?

If all checks pass, output the formatted Markdown document.