import { Fragment, useEffect, useRef } from "react";
import { IconChevronLeft, IconChevronRight, IconCircleCheck } from "@tabler/icons-react";

export function CompactStepper(props: {
  step: number;
  labels: string[];
  onStepClick?: (step: number) => void;
}): JSX.Element {
  const trackRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const scroll = (dir: number) => trackRef.current?.scrollBy({ left: dir * 120, behavior: "smooth" });

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [props.step]);

  return (
    <div className="kwiz-stepper-wrap">
      <button type="button" className="kwiz-stepper-arrow is-left" onClick={() => scroll(-1)} aria-label="Scroll left">
        <IconChevronLeft size={14} />
      </button>
      <div className="kwiz-stepper-track" ref={trackRef}>
        {props.labels.map((label, i) => {
          const stepNum = i + 1;
          const done = stepNum < props.step;
          const active = stepNum === props.step;
          const circleClass = `kwiz-stepper-circle ${done ? "is-done" : active ? "is-active" : "is-todo"}`;
          const labelClass = `kwiz-stepper-label ${done ? "is-done" : active ? "is-active" : "is-todo"}`;
          return (
            <Fragment key={stepNum}>
              {i > 0 && <span className="kwiz-stepper-connector" />}
              <button
                type="button"
                className="kwiz-stepper-item"
                ref={active ? activeRef : undefined}
                onClick={props.onStepClick ? () => props.onStepClick!(stepNum) : undefined}
                disabled={!props.onStepClick}
              >
                <span className={circleClass}>
                  {done ? <IconCircleCheck size={18} /> : stepNum}
                </span>
                <span className={labelClass}>{label}</span>
              </button>
            </Fragment>
          );
        })}
      </div>
      <button type="button" className="kwiz-stepper-arrow is-right" onClick={() => scroll(1)} aria-label="Scroll right">
        <IconChevronRight size={14} />
      </button>
    </div>
  );
}
