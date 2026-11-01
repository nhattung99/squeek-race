export function Hamster({
  color = "orange",
  className = "",
  helmet = true,
}: {
  color?: string;
  className?: string;
  helmet?: boolean;
}) {
  const fur =
    color === "violet"
      ? "#b7a0ed"
      : color === "cyan"
        ? "#88d8d9"
        : color === "pink"
          ? "#f0a8b8"
          : "#e8a05e";
  return (
    <svg
      className={className}
      viewBox="0 0 240 240"
      fill="none"
      role="img"
      aria-label="Original hamster racer"
    >
      <ellipse cx="124" cy="221" rx="66" ry="11" fill="#080c22" opacity=".4" />
      <ellipse cx="123" cy="159" rx="65" ry="62" fill={fur} />
      <ellipse cx="125" cy="172" rx="43" ry="44" fill="#ffebd2" />
      <ellipse
        cx="80"
        cy="208"
        rx="24"
        ry="13"
        fill={fur}
        transform="rotate(-15 80 208)"
      />
      <ellipse
        cx="163"
        cy="208"
        rx="24"
        ry="13"
        fill={fur}
        transform="rotate(15 163 208)"
      />
      <circle cx="72" cy="64" r="29" fill={fur} />
      <circle cx="72" cy="64" r="17" fill="#f1b3a2" />
      <circle cx="172" cy="64" r="29" fill={fur} />
      <circle cx="172" cy="64" r="17" fill="#f1b3a2" />
      <path
        d="M43 111C43 63 75 45 121 45C171 45 202 74 202 115C202 159 168 176 122 176C75 176 43 151 43 111Z"
        fill={fur}
      />
      <path
        d="M68 127C72 110 91 111 103 123C114 112 137 112 148 123C167 106 185 117 184 135C182 162 151 174 121 174C91 174 61 155 68 127Z"
        fill="#ffebd2"
      />
      <ellipse cx="84" cy="111" rx="8" ry="12" fill="#232336" />
      <ellipse cx="158" cy="111" rx="8" ry="12" fill="#232336" />
      <circle cx="86" cy="107" r="3" fill="white" />
      <circle cx="160" cy="107" r="3" fill="white" />
      <ellipse cx="67" cy="132" rx="13" ry="7" fill="#ed8991" opacity=".7" />
      <ellipse cx="177" cy="132" rx="13" ry="7" fill="#ed8991" opacity=".7" />
      <path
        d="M114 131Q122 124 130 131Q126 139 122 139Q118 139 114 131Z"
        fill="#98605d"
      />
      <path
        d="M110 145Q122 157 135 144"
        stroke="#6d494d"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="M118 149V157H127V149" fill="white" />
      {helmet && (
        <>
          <path
            d="M46 97C46 49 76 24 121 24C166 24 196 53 197 97L181 92C175 62 159 48 122 48C90 48 69 62 62 94Z"
            fill="#6f5ae9"
          />
          <path d="M112 25H133V49H112Z" fill="#a9f5ec" />
          <path d="M45 95L69 89V123L48 117Z" fill="#4c3da0" />
          <path d="M178 90L199 96L197 119L178 122Z" fill="#4c3da0" />
          <path
            d="M66 72Q119 39 174 75"
            stroke="#b7aaff"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </>
      )}
      <path d="M69 169Q47 154 47 175Q48 190 70 185" fill={fur} />
      <path d="M178 169Q201 154 201 175Q198 190 178 185" fill={fur} />
      <path d="M89 185H157L150 209H96Z" fill="#7460ec" />
      <path
        d="M105 185L110 208M141 185L136 208"
        stroke="#b5a7ff"
        strokeWidth="3"
      />
    </svg>
  );
}
