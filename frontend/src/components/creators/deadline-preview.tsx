interface DeadlinePreviewProps {
  autoDeadlines: string[];
  allocatedCount: number;
  remainingCount: number;
  quota: number;
}

export default function DeadlinePreview({
  autoDeadlines,
  allocatedCount,
  remainingCount,
  quota,
}: DeadlinePreviewProps) {
  return (
    <section>
      <h3>Deadline Preview</h3>

      <div>
        {autoDeadlines.map((deadline) => (
          <div key={deadline}>
            <span>{deadline}</span>
            <span>Auto</span>
          </div>
        ))}
      </div>

      <p>
        {allocatedCount} / {quota} allocated
      </p>

      <p>{remainingCount} remaining</p>
    </section>
  );
}