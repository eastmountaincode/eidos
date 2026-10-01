"use client";

import Image from 'next/image';
import { FileText } from 'lucide-react';
import { fileSize, isPreviewImage, type ChatAttachment } from '../../../shared/chat-attachments.mjs';

export function ChatAttachments({ files }: { files?: ChatAttachment[] }) {
  if (!files?.length) return null;
  return <div className="flex flex-wrap gap-2 py-1">
    {files.map((file) => <a key={file.id} href={`/api/chat/files/${file.id}`} target="_blank" rel="noreferrer"
      title={`Download ${file.name}`} className="flex min-w-0 max-w-full items-center gap-2 rounded-sm border border-border bg-background p-2 text-left text-[12px] leading-normal hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
      {isPreviewImage(file) ? <Image src={`/api/chat/files/${file.id}?inline=1`} alt="" width={40} height={40} unoptimized className="size-10 rounded-sm object-cover" />
        : <FileText aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />}
      <span className="min-w-0"><span className="block max-w-[200px] truncate">{file.name}</span><span className="block text-muted-foreground">{fileSize(file.size)}</span></span>
    </a>)}
  </div>;
}
