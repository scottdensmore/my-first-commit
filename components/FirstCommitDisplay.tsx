import React from 'react';
import Image from 'next/image';
import { CommitInfo } from '../app/actions';
import { formatDistanceToNow, format } from 'date-fns';
import { GoGitCommit, GoRepo } from "react-icons/go";

interface Props {
  data: CommitInfo;
  isMain?: boolean;
}

export default function FirstCommitDisplay({ data, isMain = true }: Props) {
  const dateObj = new Date(data.date);
  const widthClass = isMain ? "max-w-2xl" : "max-w-xl";
  
  return (
    <div className={`w-full ${widthClass} mx-auto border border-[var(--github-border)] rounded-md overflow-hidden font-sans text-sm shadow-sm bg-white`}>
      {/* Repository Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--github-border)] bg-[var(--github-gray-light)] text-[var(--github-gray-text)]">
        <div className="flex items-center gap-1.5">
          <GoRepo className="text-base" />
          <a href={`https://github.com/${data.repository.owner}`} className="hover:text-[var(--github-blue)] hover:underline">
            {data.repository.owner}
          </a>
          <span>/</span>
          <a href={`https://github.com/${data.repository.full_name}`} className="font-semibold hover:text-[var(--github-blue)] hover:underline text-[var(--github-gray-dark)]">
            {data.repository.name}
          </a>
        </div>
        <div className="font-mono text-xs">
           <span className="opacity-60">commit </span>
           <a href={data.html_url} className="hover:text-[var(--github-blue)] hover:underline">
             {data.sha.substring(0, 7)}
           </a>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-4 sm:p-6 bg-white">
        <div className="flex items-start gap-4">
            <div className="flex-shrink-0 pt-1">
                 {/* Avatar */}
                 <Image
                    src={data.author.avatar_url} 
                    alt={data.author.login} 
                    width={40}
                    height={40}
                    className="w-10 h-10 rounded-full border border-[var(--github-border)]"
                 />
            </div>
            <div className="flex-1 min-w-0">
                <div className="mb-1">
                    <a href={data.html_url} className="text-lg font-semibold text-[var(--github-gray-dark)] hover:text-[var(--github-blue)] hover:underline break-words">
                        {data.message.split('\n')[0]}
                    </a>
                </div>
                
                {data.message.split('\n').slice(1).join('').trim().length > 0 && (
                    <div className="mt-2 mb-3 text-[var(--github-gray-dark)] font-mono text-xs whitespace-pre-wrap bg-[var(--github-gray-light)] p-2 rounded border border-[var(--github-border)]">
                        {data.message.split('\n').slice(1).join('\n').trim()}
                    </div>
                )}
                
                <div className="flex flex-wrap items-center gap-1 text-[var(--github-gray-text)] text-xs mt-1">
                    <a href={data.author.html_url} className="font-semibold text-[var(--github-gray-dark)] hover:text-[var(--github-blue)] hover:underline">
                        {data.author.login}
                    </a>
                    <span>committed</span>
                    <span title={format(dateObj, "PPP pp")}>
                        {formatDistanceToNow(dateObj, { addSuffix: true })}
                    </span>
                </div>
            </div>
        </div>
      </div>
      
      {/* Footer Link */}
      <div className="bg-[var(--github-gray-light)] border-t border-[var(--github-border)] px-4 py-2 text-center">
         <a href={data.html_url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-[var(--github-blue)] hover:underline flex items-center justify-center gap-1">
            View full commit on GitHub <GoGitCommit />
         </a>
      </div>
    </div>
  );
}
