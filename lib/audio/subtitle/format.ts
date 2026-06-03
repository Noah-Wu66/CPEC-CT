export interface SubtitleSentence {
  begin_time: number;
  end_time: number;
  text: string;
  speaker_id?: number;
}

export function getSentenceDisplayText(sentence: SubtitleSentence): string {
  if (typeof sentence.speaker_id === 'number') {
    return `说话人 ${sentence.speaker_id}：${sentence.text}`;
  }

  return sentence.text;
}

export function msToSrtTime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;

  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${seconds.toString().padStart(2, '0')},${milliseconds
    .toString()
    .padStart(3, '0')}`;
}

export function sentencesToSrt(sentences: SubtitleSentence[]): string {
  return sentences
    .map((sentence, index) => {
      const startTime = msToSrtTime(sentence.begin_time);
      const endTime = msToSrtTime(sentence.end_time);
      return `${index + 1}\n${startTime} --> ${endTime}\n${getSentenceDisplayText(sentence)}\n`;
    })
    .join('\n');
}

export function sentencesToTxt(sentences: SubtitleSentence[]): string {
  return sentences.map((sentence) => getSentenceDisplayText(sentence)).join('\n');
}
