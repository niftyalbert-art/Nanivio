/** Reject structural ASR failures, not unfamiliar words or normal repetition.
 * This does not certify recognition accuracy or repair a vendor's transcript.
 */
export function usableSpeechTranscript(text:unknown):text is string {
  if(typeof text!=='string'||!text.trim()||text.length>12_000)return false;
  return !text.split(/\s+/u).some(word=>
    word.length>=128&&/([\p{L}]{1,16})\1{31,}/u.test(word));
}
