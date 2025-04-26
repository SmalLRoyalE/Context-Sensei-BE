import { TextAnalyzer } from './utils/textAnalysis';

const text = `Meeting Transcript: Product Development Team - April 22, 2025
Duration: 45 minutes
Participants: John Smith (JS), Maria Rodriguez (MR), Raj Patel (RP), Sarah Lee (SL), Tom Wilson (TW)

JS: Good morning everyone. Thanks for joining today's meeting. Our main agenda is to review the progress on the Context Sensei project and set priorities for the next sprint.

MR: Before we start, I'd like to address the issue with our caching mechanism. The Redis implementation is causing some performance bottlenecks.

RP: I noticed that too. The Redis cache hit rate is only around 60%, which is lower than expected. I think we need to optimize the key generation strategy.

JS: Good point. Let's make that a priority. Tom, can you take a look at that?

TW: Sure, I'll review the caching implementation. I think we should consider increasing the TTL for frequently accessed resources to improve the hit rate.

SL: Speaking of performance issues, we're also seeing some delays with the real-time transcript processing. The WebSocket connections seem stable, but there's a lag in delivering the segments.

JS: How significant is the delay?

SL: About 3-4 seconds, which is noticeable to users, especially in the Google Meet integration.

MR: That could be related to the speech-to-text service. We're using the basic tier, which has some limitations.

JS: OK, action item for Sarah: investigate the transcript processing delays and prepare a report by Friday.

SL: Got it. I'll have that ready by end of week.

RP: Moving on to the Discord bot integration, I've completed the initial setup. It's now able to listen to conversations in text channels, but I'm still working on the voice channel recording feature.

JS: What's the timeline for completing that feature?

RP: I need about 1 more week. There are some permission issues to work out with Discord's API.

TW: While we're on the subject of integrations, I've noticed that our Google Meet bot sometimes disconnects when meetings run longer than 2 hours. I think it's a token expiration issue.

JS: That's critical since some of our enterprise clients have longer meetings. Tom, please prioritize fixing that issue before working on the Redis optimization.

TW: Understood. I'll make that my top priority and have a fix by Thursday.

MR: For the next sprint, I'd like to propose focusing on the data sanitization improvements. We've had a few customers report concerns about potentially sensitive information in the transcripts.

SL: Good idea. We should enhance the redaction features and maybe implement a PII detection system.

JS: I agree. Let's include that in our next sprint. Raj, can you lead this effort?

RP: Yes, I can handle that. I'll work with Sarah to identify what kind of information we need to detect and redact.

JS: Great, so our decisions for today are:
1. Tom will fix the Google Meet token expiration issue by Thursday, then work on Redis optimization
2. Sarah will investigate transcript processing delays and report by Friday
3. Raj will continue working on the Discord voice recording feature, then lead the data sanitization improvements
4. Our next sprint will focus on data sanitization and PII detection

Anything else we need to discuss?

SL: We should also consider scheduling a user feedback session to better understand how people are using the transcription features.

JS: Good idea. Maria, can you coordinate that?

MR: Sure, I'll set up some user interviews for next week.

JS: Perfect. Thanks everyone for your time. Let's meet again next Tuesday at the same time to review progress.

[Meeting ended at 10:45 AM]`;

const analyzer = new TextAnalyzer(text);
const results = analyzer.analyze();

console.log('Analysis Results:');
console.log('================');
console.log('\nMeeting Details:');
console.log(JSON.stringify(results.meetingDetails, null, 2));
console.log('\nTasks by Employee:');
results.employees.forEach(emp => {
  console.log(`\n${emp.name} (${emp.totalTasks} tasks):`);
  emp.tasks.forEach(task => {
    console.log(`- ${task.description}`);
    console.log(`  Priority: ${task.priority}`);
    console.log(`  Deadline: ${task.deadline}`);
  });
});
console.log('\nStatistics:');
console.log(JSON.stringify(results.statistics, null, 2)); 