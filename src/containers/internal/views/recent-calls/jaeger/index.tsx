import React, { useEffect, useState } from "react";
import { getJaegerTrace } from "src/api";
import { JaegerGroup, JaegerRoot, JaegerSpan } from "src/api/jaeger-types";
import { toastError } from "src/store";
import { JaegerModalFullScreen } from "./modal";
import type { RecentCall } from "src/api/types";
import { Bar } from "./bar";
import { Button } from "@jambonz/ui-kit";
import { JaegerDetail } from "./detail";

import "./styles.scss";

type JaegerButtonProps = {
  call: RecentCall;
};

export const JaegerButton = ({ call }: JaegerButtonProps) => {
  const [jaegerRoot, setJaegerRoot] = useState<JaegerRoot>();
  const [jaegerGroup, setJaegerGroup] = useState<JaegerGroup>();
  const [jaegerDetail, setJaegerDetail] = useState<JaegerGroup>();
  const [modal, setModal] = useState(false);
  const windowSize = useWindowSize();

  const handleClose = () => {
    document.body.style.overflow = "auto";
    setModal(false);
  };

  const handleOpen = () => {
    document.body.style.overflow = "hidden";
    setModal(true);
  };

  const getSpansFromJaegerRoot = (trace: JaegerRoot) => {
    setJaegerRoot(trace);
    const spans: JaegerSpan[] = [];
    trace.resourceSpans.forEach((resourceSpan) => {
      resourceSpan.instrumentationLibrarySpans.forEach(
        (instrumentationLibrarySpan) => {
          instrumentationLibrarySpan.spans.forEach((value) =>
            spans.push(value)
          );
        }
      );
    });
    spans.sort((a, b) => a.startTimeUnixNano - b.startTimeUnixNano);
    return spans;
  };

  const getGroupsByParent = (spanId: string, groups: JaegerGroup[]) => {
    groups.sort((a, b) => a.startTimeUnixNano - b.startTimeUnixNano);
    return groups.filter((value) => value.parentSpanId === spanId);
  };

  const getRootSpan = (spans: JaegerSpan[]) => {
    const spanIds = spans.map((value) => value.spanId);
    return spans.find((value) => spanIds.indexOf(value.parentSpanId) == -1);
  };

  const getRootGroup = (grps: JaegerGroup[]) => {
    const spanIds = grps.map((value) => value.spanId);
    return grps.find((value) => spanIds.indexOf(value.parentSpanId) == -1);
  };

  const calculateRatio = (span: JaegerSpan) => {
    const { innerWidth } = window;
    const durationMs =
      (span.endTimeUnixNano - span.startTimeUnixNano) / 1_000_000;

    if (durationMs > innerWidth) {
      const offset = innerWidth > 1200 ? 3 : innerWidth > 800 ? 2.5 : 2;
      return durationMs / (innerWidth - innerWidth / offset);
    }

    return 1;
  };

  const buildSpans = (root: JaegerRoot) => {
    const spans = getSpansFromJaegerRoot(root);
    const rootSpan = getRootSpan(spans);
    if (rootSpan) {
      const startTime = rootSpan.startTimeUnixNano;
      const ratio = calculateRatio(rootSpan);
      calculateRatio(rootSpan);
      const groups: JaegerGroup[] = spans.map((span) => {
        const level = 0;
        const children: JaegerGroup[] = [];
        const startMs = (span.startTimeUnixNano - startTime) / 1_000_000;
        const durationMs =
          (span.endTimeUnixNano - span.startTimeUnixNano) / 1_000_000;
        const startPx = startMs / ratio;
        const durationPx = durationMs / ratio;
        const endPx = startPx + durationPx;
        const endMs = startMs + durationMs;
        return {
          level,
          children,
          startPx,
          endPx,
          durationPx,
          startMs,
          endMs,
          durationMs,
          ...span,
        };
      });

      const rootGroup = getRootGroup(groups);
      if (rootGroup) {
        rootGroup.children = buildChildren(
          rootGroup.level + 1,
          rootGroup,
          groups
        );
        setJaegerDetail(rootGroup);
        setJaegerGroup(rootGroup);
      }
    }
  };

  const buildChildren = (
    level: number,
    rootGroup: JaegerGroup,
    groups: JaegerGroup[]
  ): JaegerGroup[] => {
    return getGroupsByParent(rootGroup.spanId, groups).map((group) => {
      group.level = level;
      group.children = buildChildren(group.level + 1, group, groups);
      return group;
    });
  };

  useEffect(() => {
    if (call.trace_id && call.trace_id != "00000000000000000000000000000000") {
      getJaegerTrace(call.account_sid, call.trace_id)
        .then(({ json }) => {
          if (json) {
            buildSpans(json);
          }
        })
        .catch((error) => {
          toastError(error.msg);
        });
    }
  }, []);

  useEffect(() => {
    if (jaegerRoot) {
      buildSpans(jaegerRoot);
    }
  }, [windowSize]);

  if (jaegerGroup) {
    return (
      <>
        <button className="btn btn--small pcap" onClick={handleOpen}>
          View trace
        </button>
        {modal && (
          <JaegerModalFullScreen>
            <div className="modalHeader">
              <Button type="button" small onClick={handleClose}>
                Back
              </Button>
              <div className="modalHeader__header_item">
                <div>Trace ID:</div>
                <div>{call.trace_id}</div>
              </div>
            </div>
            <div className="barGroup">
              <Bar group={jaegerGroup} handleRowSelect={setJaegerDetail} />
            </div>
            {jaegerDetail && <JaegerDetail group={jaegerDetail} />}
          </JaegerModalFullScreen>
        )}
      </>
    );
  }
  return null;
};

function useWindowSize() {
  const [windowSize, setWindowSize] = useState({
    width: 100,
    height: 100,
  });
  useEffect(() => {
    function handleResize() {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }

    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return windowSize;
}
