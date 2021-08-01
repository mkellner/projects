# Ornaments

WildClocks ornaments are connected to a controller.

The controller uses a sequence to drive the various ornaments.

The sequence is composed of elements that describe when and how an action is applied to an ornament.

# Layout

Each ornament has a layout. Some layouts are fixed (star, sevenseg) and some are a bit flexible (line - length).

### ztar r1
6 pixels on 5 arms

### ztar r2
5 pixels on 5 arms

### line
_n_ pixels in a row

### sevenseg
A variety of seven segment displays

### concentric
Concentric circles

### hartz
Segmented heart

# Actions

## pulseAll (PLSA)

#### kind

variation

* 1 - pulseAll.SPARKLE

#### color
 an RGB color or "rainbow" or "random"
 
#### duration
 ms for length of the pulse

#### ftb
 ms to fade to black
 

## pulse (PULS)

#### kind

 1) rainbow color (?)
 
#### dir
 direction: -1 reverses the direction

#### color

#### duration

#### start

#### end

#### some
	array of some pixels to light (ie. [0, 2, 3, 9] )

#### repeat
	if set, pulse again at end

## pulseLines (PLSL)

#### kind

 1)(cross)  all at once
 
 2)(cross) center out
 
 3) each line delayed a bit
 	param:delay?(need to add)
 
 4) pulse per layout.digit
 
 5) pulse all per line (delay between each line)
 
 6) pulse each line in sequence
 
#### variant
  variant: - to indicate which LINES to use
  0 - lines
  1 - linesh
  2 - linesv
  3 - layout.digit
  4 - random (one of the above)

#### dir
 direction: -1 reverses the direction

#### color
  an RGB color or "random"

  or an array of colors to apply to the set of lines

#### duration

#### ftb
 ms to fade to black
 

## rainbow (RNBW)

#### kind

 (absent or 0) - use angles (ranbow around arms of star)
 
 1) use cangles (concentric angles) instead of angles
 
 2) over lines
 
 3) sunrise
 
 4) moving sunrise
 
 5) target
 
 6) moving target
 
#### dir
 direction: -1 reverses the direction

#### duration
  time for a complete hue cycle


