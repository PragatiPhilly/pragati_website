/**
 * "How this works", in the words a volunteer already has.
 *
 * A native <details> — no JavaScript, works on any tablet, and closed by
 * default so it costs nothing once you know the drill. Every screen that could
 * confuse someone on their first shift links back to this.
 *
 * The rule for the copy: no word here that you wouldn't say out loud to
 * somebody at the door. "Cash box", not "till". "Still to pay", not "balance".
 */
export default function HelpPanel({ variant = "desk" }: { variant?: "desk" | "order" | "money" }) {
  if (variant === "order") {
    return (
      <details className="desk-help">
        <summary>❓ What do I do on this screen?</summary>
        <div className="help-body">
          <ol>
            <li>
              The big number is <b>what they still owe</b>. When it reaches $0.00 they’re done.
            </li>
            <li>
              Take the money under <b>Take a payment</b> — cash, cheque, Zelle or card. You can take part of it now
              and the rest later; just add another payment.
            </li>
            <li>
              No money on them? <b>Let them in and collect later</b> — it goes on the to-do list with your name on it.
            </li>
            <li>
              Print a paper slip if they have no email. Their passes are on it and they can scan straight in.
            </li>
          </ol>
          <p style={{ margin: 0 }}>
            Nothing here is ever deleted. If you make a mistake, undo the payment or cancel the booking — both keep a
            record, and that’s deliberate.
          </p>
        </div>
      </details>
    );
  }

  if (variant === "money") {
    return (
      <details className="desk-help">
        <summary>❓ What is this page for?</summary>
        <div className="help-body">
          <p>
            Guests on this page have <b>already paid</b>. This is only about where their money physically is right
            now — in someone’s pocket, in a cash box, or in a cheque nobody has banked yet.
          </p>
          <p style={{ margin: 0 }}>
            When you’ve banked it, tick it off here with the bank slip number. That’s what stops us chasing
            money that already arrived — or forgetting money that never did.
          </p>
        </div>
      </details>
    );
  }

  return (
    <details className="desk-help">
      <summary>❓ First time at the desk? Read this — takes a minute</summary>
      <div className="help-body">
        <ol>
          <li>
            <b>Always search first.</b> Type their name or phone. Lots of families already booked online — if you find
            them, open their booking instead of making a new one.
          </li>
          <li>
            <b>Nobody found? Register a new family.</b> Tap the big red button, add each person, pick their days.
          </li>
          <li>
            <b>Only a name is required.</b> No email, no phone, no problem — take it later. Never make one up.
          </li>
          <li>
            <b>Take the money</b> — cash, cheque, Zelle or card. If a Zelle went to someone’s own phone instead of
            Pragati’s account, say whose. That’s how it gets chased later.
          </li>
          <li>
            <b>Give them their passes.</b> They’re emailed automatically; print a paper slip if there’s no
            email.
          </li>
        </ol>
        <p style={{ margin: 0 }}>
          <b>The cash box</b> is just a record of the money in front of you: you say how much change you started with,
          and at the end someone counts it. It has to be started before you can take cash — that way every payment has
          a name on it and nobody gets blamed for a shortfall that isn’t theirs.
        </p>
      </div>
    </details>
  );
}
