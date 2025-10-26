import {
  Building,
  Star,
  Utensils,
  Car,
  Scissors,
  Wrench,
  ShoppingBag,
  Stethoscope,
  GraduationCap,
  Home as HomeIcon,
  Briefcase,
  Dumbbell,
  Coffee,
  Camera,
  Shirt,
  Gamepad2,
  Plane,
  Heart,
  Users,
  Award,
  TrendingUp,
  Crown,
  MapPin,
} from "lucide-react";

export const ICON_LIBRARY = [
  { value: "Building", label: "Building", Icon: Building },
  { value: "Star", label: "Star", Icon: Star },
  { value: "Utensils", label: "Utensils", Icon: Utensils },
  { value: "Car", label: "Car", Icon: Car },
  { value: "Scissors", label: "Scissors", Icon: Scissors },
  { value: "Wrench", label: "Wrench", Icon: Wrench },
  { value: "ShoppingBag", label: "Shopping Bag", Icon: ShoppingBag },
  { value: "Stethoscope", label: "Stethoscope", Icon: Stethoscope },
  { value: "GraduationCap", label: "Graduation Cap", Icon: GraduationCap },
  { value: "Home", label: "Home", Icon: HomeIcon },
  { value: "Briefcase", label: "Briefcase", Icon: Briefcase },
  { value: "Dumbbell", label: "Dumbbell", Icon: Dumbbell },
  { value: "Coffee", label: "Coffee", Icon: Coffee },
  { value: "Camera", label: "Camera", Icon: Camera },
  { value: "Shirt", label: "Shirt", Icon: Shirt },
  { value: "Gamepad2", label: "Gamepad 2", Icon: Gamepad2 },
  { value: "Plane", label: "Plane", Icon: Plane },
  { value: "Heart", label: "Heart", Icon: Heart },
  { value: "Users", label: "Users", Icon: Users },
  { value: "Award", label: "Award", Icon: Award },
  { value: "TrendingUp", label: "Trending Up", Icon: TrendingUp },
  { value: "Crown", label: "Crown", Icon: Crown },
  { value: "MapPin", label: "Map Pin", Icon: MapPin },
];

export const ICON_MAP = ICON_LIBRARY.reduce((acc, it) => {
  acc[it.value] = it.Icon;
  return acc;
}, {});

export const getIconByName = (name) => ICON_MAP[name] || Building;