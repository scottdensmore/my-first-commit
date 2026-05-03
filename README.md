# My First Commit

A GitHub-themed web application that discovers your origin story on GitHub. Enter any username to see their first public commit and the nine that followed, beautifully connected in an activity-graph style timeline.

## Features

- **Origin Discovery:** Uses the GitHub Search API to find the earliest public commits for any user.
- **Visual Timeline:** Displays a sequence of the first 10 commits, connected by a vertical line with GitHub-style contribution squares.
- **GitHub Aesthetic:** Fully themed with GitHub's color palette, typography, and iconography.
- **Responsive Design:** Optimized for both desktop and mobile viewing.

## Getting Started

### Prerequisites

- Node.js 22, or any version matching `>=20.9.0`
- npm

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd my-first-commit
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Configuration (Important)

The application works out of the box using unauthenticated GitHub API requests. However, GitHub imposes a strict rate limit on unauthenticated search requests (10 per minute).

To avoid "Rate limit exceeded" errors, it is highly recommended to use a GitHub Personal Access Token:

1. Create a **Fine-grained personal access token** or a **Tokens (classic)** on GitHub: [Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens).
2. Create a file named `.env.local` in the root directory.
3. Add your token to the file:
   ```env
   GITHUB_TOKEN=your_github_pat_here
   ```

### Running Locally

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to explore.

### Validation

Run the same checks used by CI:

```bash
npm audit
npm test
npm run lint
npm run build
```

For active test-driven development:

```bash
npm run test:watch
```

## Production Notes

- Set `GITHUB_TOKEN` in the production environment to avoid GitHub's low unauthenticated search rate limit.
- The token is only used server-side by the GitHub API client and is not exposed to the browser.
- Usernames entered into the search field are sent to GitHub to retrieve public commit data; the app does not store searches.
- CI runs on every push and pull request to `main`.

## Deployment

This is a standard Next.js app and can be deployed to Vercel or any host that supports Next.js with Node.js 22.

Required production command:

```bash
npm run build
```

Recommended environment variable:

```env
GITHUB_TOKEN=your_github_pat_here
NEXT_PUBLIC_SITE_URL=https://your-production-domain.example
```

## Tech Stack

- **Framework:** [Next.js](https://nextjs.org/) (App Router)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **API Client:** [Octokit](https://github.com/octokit/octokit.js)
- **Icons:** [React Icons](https://react-icons.github.io/react-icons/)
- **Date Handling:** [date-fns](https://date-fns.org/)

## License

MIT
