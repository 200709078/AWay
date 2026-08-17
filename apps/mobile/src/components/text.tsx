import { forwardRef } from "react";
import {
  Text as NativeText,
  type TextProps,
  type TextStyle,
} from "react-native";

const noUserSelect: TextStyle = { userSelect: "none" };

export type ApplicationText = React.ElementRef<typeof NativeText>;

export const Text = forwardRef<ApplicationText, TextProps>(function AppText(
  { style, ...props },
  ref,
) {
  return <NativeText {...props} ref={ref} style={[noUserSelect, style]} />;
});