# MyFirstCommit

A GitHub-themed web application that discovers your origin story on GitHub. Enter any username to see their first public commit and the nine that followed, beautifully connected in an activity-graph style timeline.

## Features

- **Origin Discovery:** Uses the GitHub Search API to find the earliest public commits for any user.
- **Visual Timeline:** Displays a sequence of the first 10 commits, connected by a vertical line with GitHub-style contribution squares.
- **GitHub Aesthetic:** Fully themed with GitHub's color palette, typography, and iconography.
- **Responsive Design:** Optimized for both desktop and mobile viewing.

## Getting Started

### Prerequisites

- Node.js (Latest LTS recommended)
- npm

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd myfirstcommit
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

## Tech Stack

- **Framework:** [Next.js](https://nextjs.org/) (App Router)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **API Client:** [Octokit](https://github.com/octokit/octokit.js)
- **Icons:** [React Icons](https://react-icons.github.io/react-icons/)
- **Date Handling:** [date-fns](https://date-fns.org/)

## License

MIT