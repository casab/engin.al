---
author: Engin Al
pubDatetime: 2025-02-03T18:00:00Z
title: Enhancing Your Resume with LLMs
slug: enhancing-resume-with-llms
featured: true
draft: false
tags:
  - ai
  - career
  - resume
  - llms
description: Learn how to use Large Language Models (LLMs) to refine your resume and accurately reflect your contributions to past projects.
---

Your resume is a critical tool for landing your next job. However, many professionals struggle to articulate their achievements effectively. This is where Large Language Models (LLMs) like ChatGPT and Claude can help. By analyzing your actual code contributions, LLMs can provide a clearer and more impactful representation of your work.

## Table of contents

## Extracting Your Contributions from Git Logs

If you've worked on multiple repositories in your previous roles, it's important to accurately reflect your contributions. Instead of relying on memory, you can extract your commit history directly from Git logs.

Run the following command for each repository you contributed to:

```sh
git log --author="your_email_address" --oneline > repo1_commits.txt
```

Replace `your_email_address` with the email you used for commits. This command saves a summary of your commits to a file, which can then be analyzed by an LLM.

Repeat this step for all repositories you've contributed to and consolidate them into a single file if needed.

## Using LLMs to Improve Your Resume

Once you've gathered your commit history, you can use an LLM to enhance the way you describe your experience. Simply provide the model with the commit logs and your current resume section for that role.

### Prompt to Use:

```txt
These are my commit logs from the projects that I have worked on in my last company.

-- Paste commit logs here --

In my CV, I have listed this experience as follows:

-- Paste your current CV section for this role --

By checking these commit logs, how can I improve what I write there? Can you rewrite this section?
```

The LLM will analyze your commits and suggest improvements, ensuring your resume more accurately reflects your contributions. This method helps:
- Highlight key technical skills.
- Emphasize impactful contributions.
- Use action-oriented language that aligns with hiring trends.

## Example Improvement

### **Before:**
> Worked on backend development for a fintech application. Implemented API endpoints and fixed bugs.

### **After (AI-enhanced):**
> Led backend development for a fintech application, implementing RESTful APIs that reduced data retrieval time by 30%. Optimized database queries and resolved critical security vulnerabilities, improving system stability.

## Why This Works

LLMs help reframe your work experience in a results-driven manner, making it easier for recruiters and hiring managers to recognize your value. Instead of generic descriptions, you present measurable impact and clear accomplishments.

## Final Thoughts

Using LLMs to enhance your resume ensures that your job applications truly reflect your skills and contributions. By following this process, you can create a resume that stands out in a competitive job market.

Try it out and see how your resume improves!
